"""Prepare a separate DEV applicability fallback artifact without changing models.

Only empty strong-result lists receive up to three lower-confidence candidates.
The query floor is fitted on DEV query maxima, not on runtime examples or TEST.
DEV results remain resubstitution, including the known OOS false acceptances.
"""
import argparse
import copy
import json
import shutil
from pathlib import Path
import numpy as np
from common import ROOT, DIMENSION, canonical_hash, encoding_fingerprint, policy_from_metadata, sha256_file, relevance_matrix, threshold_from_scores, retrieval_metrics
from dataset_v2 import dataset_hash, records, validate
from prepare_fusion import load_dev_cache, score_fusion, save_json
from reranker import ADMISSION_KIND, validate_artifact, version_fingerprint

SOURCE_FILES = ("common.py", "dataset.py", "dataset_v2.py", "reranker.py", "prepare_fusion.py", "prepare_admission.py", "worker.py", "check_worker.py", "requirements.txt")

def load_features(source, metadata, dev):
    calibration = metadata["reranker"]["scoreCalibration"]
    if canonical_hash(dev) != calibration["hashes"]["devRecordsSha256"]:
        raise ValueError("DEV records differ from the frozen calibration snapshot")
    cross = load_dev_cache(source / "reranker-dev-scores.npz", calibration["hashes"]["crossScoresSha256"], dev, metadata["reranker"]["calibration"])
    path = source / "fusion-dev-features.npz"
    with np.load(path, allow_pickle=False) as cache:
        if set(cache.files) != {"encoderCosine", "crossEncoderRawLogit", "queryIds", "documentIds"}:
            raise ValueError("Unexpected frozen fusion feature-cache fields")
        if cache["queryIds"].ndim != 1 or cache["documentIds"].ndim != 1 or cache["queryIds"].tolist() != [q["id"] for q in dev["queries"]] or cache["documentIds"].tolist() != [d["id"] for d in dev["documents"]]:
            raise ValueError("Frozen feature-cache IDs or ordering differ from DEV")
        dense = cache["encoderCosine"]
        if dense.dtype.kind != "f" or dense.shape != cross.shape or not np.isfinite(dense).all() or not np.array_equal(cache["crossEncoderRawLogit"], cross):
            raise ValueError("Frozen feature-cache scores differ from the calibrated DEV features")
        dense = dense.copy()
    if canonical_hash(dense.tolist()) != calibration["hashes"]["denseScoresSha256"]:
        raise ValueError("Dense DEV feature scores do not match their frozen digest")
    return dense, cross, sha256_file(path)

def select_with_fallback(scores, strong_cutoff, admission_cutoff, limit=3):
    scores = np.asarray(scores, dtype=np.float64)
    if scores.ndim != 2 or not np.isfinite(scores).all() or type(limit) is not int or limit != 3:
        raise ValueError("Expected a finite score matrix and the fixed top-three limit")
    strong = scores >= strong_cutoff
    fallback = np.zeros_like(strong)
    for index in np.flatnonzero(~strong.any(axis=1)):
        order = np.argsort(-scores[index], kind="stable")[:limit]
        chosen = order[scores[index, order] >= admission_cutoff]
        fallback[index, chosen] = True
    return strong, fallback

def selection_summary(selected, relevant):
    known = relevant.any(axis=1)
    accepted, accepted_relevant = selected.any(axis=1), (selected & relevant).any(axis=1)
    tp, fp = int((selected & relevant).sum()), int((selected & ~relevant).sum())
    fn, tn = int((~selected & relevant).sum()), int((~selected & ~relevant).sum())
    return dict(positiveQueryAcceptance=int((accepted & known).sum()), positiveQueriesWithAcceptedRelevant=int((accepted_relevant & known).sum()),
                positiveQueriesAcceptedOnlyIrrelevant=int((accepted & known & ~accepted_relevant).sum()),
                positiveQueriesEmpty=int((~accepted & known).sum()), OOSAcceptance=int((accepted & ~known).sum()),
                acceptedPairs=int(selected.sum()), pairMetrics=dict(precision=tp / max(1, tp + fp), recall=tp / max(1, tp + fn),
                f1=2 * tp / max(1, 2 * tp + fp + fn), truePositive=tp, falsePositive=fp, falseNegative=fn, trueNegative=tn))

def calibrate_admission(scores, truth, strong_cutoff):
    if scores.shape != truth.shape or not scores.size or not np.isfinite(scores).all():
        raise ValueError("Expected finite frozen DEV pair scores and qrels")
    labels = truth.any(axis=1)
    if not labels.any() or labels.all():
        raise ValueError("Admission DEV needs both applicable and unrelated query controls")
    selection = threshold_from_scores(scores.max(axis=1).reshape(-1, 1), labels.reshape(-1, 1))
    selection["criterion"] = "query-max-F1-then-precision-then-recall"
    if selection["threshold"] >= strong_cutoff:
        raise ValueError("DEV admission floor does not define a lower-confidence fallback")
    strong, fallback = select_with_fallback(scores, strong_cutoff, selection["threshold"])
    empty_strong = ~strong.any(axis=1)
    metrics = dict(resubstitution=True, heldOutScored=False, functionalBenchmarkScored=False,
                   positiveQueries=int(labels.sum()), unknownQueries=int((~labels).sum()), documents=scores.shape[1], documentPairs=int(scores.size),
                   queryThresholdSelection=selection, strict=selection_summary(strong, truth), withFallback=selection_summary(strong | fallback, truth),
                   fallbackOnly=dict(eligibleQueries=int(empty_strong.sum()), triggeredQueries=int(fallback.any(axis=1).sum()),
                                     positiveEligibleQueries=int((empty_strong & labels).sum()),
                                     unknownEligibleQueries=int((empty_strong & ~labels).sum()),
                                     maximumReturnedCandidates=3, selection=selection_summary(fallback[empty_strong], truth[empty_strong])),
                   description="Query applicability floor fitted on source DEV query maxima; metrics are resubstitution, with small OOS controls")
    return selection["threshold"], metrics

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()
    if not 1 <= args.threads <= 64:
        parser.error("CPU threads must be between 1 and 64")
    source, output = args.model.resolve(), args.output.resolve()
    if output.exists() or source in output.parents or output == source:
        raise RuntimeError("Use a NEW output directory outside the immutable fusion artifact")
    metadata_path = source / "metadata.json"
    original = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not original.get("trained") or original["dimension"] != DIMENSION or not original.get("reranker", {}).get("scoreCalibration"):
        raise RuntimeError("Expected the frozen trained encoder and calibrated fusion artifact")
    stage = original["reranker"]
    calibration = stage["scoreCalibration"]
    if "admission" in calibration:
        raise RuntimeError("Source artifact already has an admission fallback")
    validate_artifact(source, stage)
    if sha256_file(source / "model.safetensors") != original["weightsSha256"]:
        raise RuntimeError("Encoder weights do not match their frozen manifest")
    fingerprint = encoding_fingerprint(original["weightsSha256"], policy_from_metadata(original))
    pipeline = canonical_hash(dict(encoderEncodingFingerprint=fingerprint, rerankerVersion=stage["version"]))
    if original["encodingFingerprint"] != fingerprint or original["pipelineFingerprint"] != pipeline or original["modelVersion"] != original["encoderModelVersion"] + "-rank-" + pipeline[:12]:
        raise RuntimeError("Source fusion or encoder identity does not match its fingerprint")
    if calibration["hashes"]["encodingFingerprint"] != fingerprint or calibration["hashes"]["encoderWeightsSha256"] != original["weightsSha256"]:
        raise RuntimeError("Source fusion calibration does not belong to the frozen encoder")
    dataset_path = (source / original["datasetSnapshot"]).resolve()
    dataset_path.relative_to(source)
    value = json.loads(dataset_path.read_text(encoding="utf-8"))
    validate(value)
    if dataset_hash(value) != original["datasetSha256"] or calibration["hashes"]["datasetSha256"] != original["datasetSha256"]:
        raise RuntimeError("Source dataset snapshot does not match the frozen fusion manifest")
    dev = records("dev", value)
    print(json.dumps(dict(phase="check-frozen-dev-features", queries=len(dev["queries"]), documents=len(dev["documents"]))), flush=True)
    dense, cross, cache_hash = load_features(source, original, dev)
    features = np.stack([dense.reshape(-1), cross.reshape(-1)], axis=1)
    scores = score_fusion(features, calibration).reshape(dense.shape)
    truth = relevance_matrix(dev["queries"], dev["documents"])
    if threshold_from_scores(scores, truth) != calibration["DEVmetrics"]["fusion"]["thresholdSelection"] or retrieval_metrics(scores, truth) != calibration["DEVmetrics"]["fusion"]["ranking"]:
        raise RuntimeError("Replayed frozen pair scores do not reproduce their DEV calibration report")
    cutoff, metrics = calibrate_admission(scores, truth, calibration["threshold"])
    plan = dict(kind=ADMISSION_KIND, limit=3, split="dev", sourceModelVersion=original["modelVersion"],
                retainedPairThreshold=calibration["threshold"], cpuThreads=args.threads, cachedFeatures=True,
                coefficientsChanged=False, heldOutScored=False, functionalBenchmarkScored=False, resubstitution=True,
                thresholdSelection="query-max-F1-then-precision-then-recall")
    shutil.copytree(source, output, ignore=shutil.ignore_patterns("source", "__pycache__"))
    if (source / "source").is_dir():
        shutil.copytree(source / "source", output / "fusion-source")
    shutil.copy2(metadata_path, output / "fusion-metadata.json")
    save_json(output / "admission-preparation-plan.json", plan)
    save_json(output / "runState.json", dict(state="preparing-admission", **plan))
    source_hashes = {}
    (output / "source").mkdir()
    for name in SOURCE_FILES:
        shutil.copy2(ROOT / "ml" / name, output / "source" / name)
        source_hashes[name] = sha256_file(output / "source" / name)
    admission = dict(kind=ADMISSION_KIND, threshold=cutoff, limit=3, split="dev", metrics=metrics,
                     hashes=dict(datasetSha256=original["datasetSha256"], encodingFingerprint=fingerprint,
                                 sourceMetadataSha256=sha256_file(metadata_path), devRecordsSha256=canonical_hash(dev),
                                 denseScoresSha256=calibration["hashes"]["denseScoresSha256"], crossScoresSha256=calibration["hashes"]["crossScoresSha256"],
                                 featureCacheSha256=cache_hash, sourceCalibrationSha256=canonical_hash(calibration),
                                 calibrationSourceSha256=source_hashes["prepare_admission.py"]))
    new_stage = copy.deepcopy(stage)
    new_stage["scoreCalibration"]["admission"] = admission
    new_stage["version"] = "mmarco-minilm-" + version_fingerprint(new_stage)[:12]
    new_pipeline = canonical_hash(dict(encoderEncodingFingerprint=fingerprint, rerankerVersion=new_stage["version"]))
    result = copy.deepcopy(original)
    result.update(reranker=new_stage, pipelineFingerprint=new_pipeline,
                  modelVersion=original["encoderModelVersion"] + "-rank-" + new_pipeline[:12],
                  sourceHashes=source_hashes, fusionSourceHashes=original["sourceHashes"],
                  pipelineKind=original["pipelineKind"] + "-query-applicability-top3-fallback")
    result["limitations"] += ["Admission query floor is calibrated on the same synthetic DEV queries; it is not an independent generalization estimate.",
                              "Fallback returns at most three lower-confidence suggestions only when no pair clears the unchanged strong cutoff.",
                              f"DEV fallback accepts {metrics['withFallback']['OOSAcceptance']} of {metrics['unknownQueries']} unrelated controls; this is not reliable universal OOS detection.",
                              "DEV report uses the full 140-document pool; runtime shortlist, sections and user filters require separate functional checks."]
    save_json(output / "admission-calibration.json", admission)
    save_json(output / "metadata.json", result)
    validate_artifact(output, new_stage)
    save_json(output / "runState.json", dict(state="prepared-dev-admission", modelVersion=result["modelVersion"],
                                            pipelineFingerprint=new_pipeline, admissionThreshold=cutoff, **plan))
    print(json.dumps(dict(phase="ready", output=str(output), modelVersion=result["modelVersion"], admission=admission)), flush=True)

if __name__ == "__main__":
    main()
