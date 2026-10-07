"""Prepare an immutable two-feature DEV calibration artifact, without training.

Both coefficient fitting and cutoff selection use the same DEV pairs. Reported
DEV metrics are resubstitution, not independent generalization estimates. No
TEST or functional regression scores are computed by this command.
"""
import argparse
import copy
import json
import shutil
import time
from pathlib import Path
import numpy as np
from common import ROOT, DIMENSION, Encoder, canonical_hash, encoding_fingerprint, policy_from_metadata, sha256_file, relevance_matrix, retrieval_metrics, threshold_from_scores
from dataset_v2 import dataset_hash, records, validate
from reranker import FUSION_KIND, QDA_FUSION_KIND, FUSION_SHRINK, FUSION_POLICY, QDA_FUSION_POLICY, validate_artifact, version_fingerprint, calibration_parameters_hash

SOURCE_FILES = ("common.py", "dataset.py", "dataset_v2.py", "reranker.py", "prepare_fusion.py", "worker.py", "check_worker.py", "requirements.txt")

def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")

def fit_lda(features, relevant):
    """Equal-prior linear discriminant, pooled covariance, fixed 10% diagonal shrink."""
    x = np.asarray(features, dtype=np.float64)
    y = np.asarray(relevant, dtype=bool).reshape(-1)
    if x.shape != (len(y), 2) or not np.isfinite(x).all() or min(int(y.sum()), int((~y).sum())) < 2:
        raise ValueError("LDA requires finite two-feature pairs and two examples in each class")
    positive, negative = x[y], x[~y]
    mean_positive, mean_negative = positive.mean(axis=0), negative.mean(axis=0)
    centered_positive, centered_negative = positive - mean_positive, negative - mean_negative
    pooled = (centered_positive.T @ centered_positive + centered_negative.T @ centered_negative) / (len(x) - 2)
    covariance = (1 - FUSION_SHRINK) * pooled + FUSION_SHRINK * np.diag(np.diag(pooled))
    if not np.isfinite(covariance).all() or np.linalg.eigvalsh(covariance).min() <= 0:
        raise ValueError("Fusion features have a degenerate pooled covariance")
    weights = np.linalg.solve(covariance, mean_positive - mean_negative)
    bias = float(-.5 * (mean_positive + mean_negative) @ weights)
    if not np.isfinite(weights).all() or not np.isfinite(bias):
        raise ValueError("Fusion produced non-finite parameters")
    return dict(weights=weights.tolist(), bias=bias,
                statistics=dict(positiveMean=mean_positive.tolist(), negativeMean=mean_negative.tolist(),
                                pooledCovariance=pooled.tolist(), shrunkCovariance=covariance.tolist(),
                                positivePairs=len(positive), negativePairs=len(negative), equalClassPriors=True))

def fit_qda(features, relevant):
    """Equal-prior class Gaussian log-density ratio, fixed 10% diagonal shrink."""
    x = np.asarray(features, dtype=np.float64)
    y = np.asarray(relevant, dtype=bool).reshape(-1)
    if x.shape != (len(y), 2) or not np.isfinite(x).all() or min(int(y.sum()), int((~y).sum())) < 2:
        raise ValueError("QDA requires finite two-feature pairs and two examples in each class")
    classes = []
    for positive in (False, True):
        values = x[y == positive]
        mean = values.mean(axis=0)
        centered = values - mean
        covariance = centered.T @ centered / (len(values) - 1)
        shrunk = (1 - FUSION_SHRINK) * covariance + FUSION_SHRINK * np.diag(np.diag(covariance))
        if not np.isfinite(shrunk).all() or np.linalg.eigvalsh(shrunk).min() <= 0:
            raise ValueError("QDA features have a degenerate class covariance")
        sign, log_determinant = np.linalg.slogdet(shrunk)
        if sign <= 0 or not np.isfinite(log_determinant):
            raise ValueError("Invalid QDA covariance determinant")
        classes.append(dict(mean=mean, covariance=covariance, shrunk=shrunk,
                            inverse=np.linalg.inv(shrunk), logDeterminant=float(log_determinant), pairs=len(values)))
    negative, positive = classes
    matrix = .5 * (negative["inverse"] - positive["inverse"])
    # Store exact symmetry so both runtime implementations use the same polynomial.
    matrix = .5 * (matrix + matrix.T)
    weights = positive["inverse"] @ positive["mean"] - negative["inverse"] @ negative["mean"]
    bias = .5 * (negative["mean"] @ negative["inverse"] @ negative["mean"]
                 - positive["mean"] @ positive["inverse"] @ positive["mean"]
                 + negative["logDeterminant"] - positive["logDeterminant"])
    if not np.isfinite(matrix).all() or not np.isfinite(weights).all() or not np.isfinite(bias):
        raise ValueError("QDA produced non-finite parameters")
    return dict(weights=weights.tolist(), bias=float(bias), quadraticMatrix=matrix.tolist(),
                statistics=dict(positiveMean=positive["mean"].tolist(), negativeMean=negative["mean"].tolist(),
                                positiveCovariance=positive["covariance"].tolist(), negativeCovariance=negative["covariance"].tolist(),
                                positiveShrunkCovariance=positive["shrunk"].tolist(), negativeShrunkCovariance=negative["shrunk"].tolist(),
                                positivePairs=positive["pairs"], negativePairs=negative["pairs"], equalClassPriors=True))

def score_fusion(features, fitted):
    x = np.asarray(features, dtype=np.float64)
    if x.ndim != 2 or x.shape[1] != 2 or not np.isfinite(x).all():
        raise ValueError("Expected finite two-feature pairs")
    scores = x @ np.asarray(fitted["weights"]) + fitted["bias"]
    if "quadraticMatrix" in fitted:
        scores += np.einsum("ij,jk,ik->i", x, np.asarray(fitted["quadraticMatrix"]), x)
    if not np.isfinite(scores).all():
        raise ValueError("Fusion produced non-finite scores")
    return scores

def load_dev_cache(path, expected_hash, dev, calibration):
    """Check an explicitly trusted digest before loading a pickle-free score cache."""
    if not isinstance(expected_hash, str) or len(expected_hash) != 64 or any(c not in "0123456789abcdef" for c in expected_hash):
        raise ValueError("A trusted SHA256 digest is required for the cached DEV scores")
    if sha256_file(path) != expected_hash:
        raise ValueError("Cached DEV scores do not match the expected SHA256 digest")
    if any(d["split"] not in {"train", "dev"} for d in dev["documents"]) or any(q["split"] != "dev" for q in dev["queries"]):
        raise ValueError("Fusion calibration must not use TEST records")
    with np.load(path, allow_pickle=False) as value:
        if set(value.files) != {"scores", "queryIds", "documentIds"}:
            raise ValueError("Unexpected score cache fields")
        query_ids = value["queryIds"]
        document_ids = value["documentIds"]
        if query_ids.ndim != 1 or document_ids.ndim != 1 or query_ids.tolist() != [q["id"] for q in dev["queries"]] or document_ids.tolist() != [d["id"] for d in dev["documents"]]:
            raise ValueError("Score cache record IDs or ordering differ from the frozen DEV snapshot")
        scores = value["scores"]
        if scores.dtype.kind != "f" or scores.shape != (len(query_ids), len(document_ids)) or not np.isfinite(scores).all():
            raise ValueError("Unexpected score cache shape, type or non-finite values")
        scores = scores.copy()
    truth = relevance_matrix(dev["queries"], dev["documents"])
    if calibration.get("split") != "dev" or calibration.get("documentPairs") != scores.size or calibration.get("heldOutScored") is not False:
        raise ValueError("Cached calibration provenance does not describe DEV pairs")
    if threshold_from_scores(scores, truth) != calibration["thresholdSelection"] or retrieval_metrics(scores, truth) != calibration["ranking"]:
        raise ValueError("Cached scores do not reproduce the frozen cross-encoder calibration report")
    return scores

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--kind", choices=("lda", "qda"), default="lda")
    parser.add_argument("--dev-scores-sha256", help="Trusted cache digest for older artifacts without a persisted digest")
    args = parser.parse_args()
    if not 1 <= args.threads <= 64:
        parser.error("CPU threads must be between 1 and 64")
    source, output = args.model.resolve(), args.output.resolve()
    if output.exists() or source in output.parents or output == source:
        raise RuntimeError("Use a NEW output directory outside the immutable source artifact")
    metadata_path = source / "metadata.json"
    original = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not original.get("trained") or original["dimension"] != DIMENSION or not original.get("reranker") or original["reranker"].get("scoreCalibration"):
        raise RuntimeError("Expected the frozen trained encoder plus DEV-calibrated reranker without fusion")
    stage = original["reranker"]
    validate_artifact(source, stage)
    if sha256_file(source / "model.safetensors") != original["weightsSha256"]:
        raise RuntimeError("Encoder weights do not match their immutable manifest")
    fingerprint = encoding_fingerprint(original["weightsSha256"], policy_from_metadata(original))
    pipeline = canonical_hash(dict(encoderEncodingFingerprint=fingerprint, rerankerVersion=stage["version"]))
    if original["encodingFingerprint"] != fingerprint or original["pipelineFingerprint"] != pipeline or original["modelVersion"] != original["encoderModelVersion"] + "-rank-" + pipeline[:12]:
        raise RuntimeError("Source stage or encoder identity does not match its fingerprint")
    dataset_path = (source / original["datasetSnapshot"]).resolve()
    dataset_path.relative_to(source)
    value = json.loads(dataset_path.read_text(encoding="utf-8"))
    validate(value)
    if dataset_hash(value) != original["datasetSha256"] or stage["calibration"]["datasetSha256"] != original["datasetSha256"]:
        raise RuntimeError("Source dataset snapshot does not match the encoder and reranker manifests")
    dev = records("dev", value)
    cache_path = source / "reranker-dev-scores.npz"
    calibration_path = source / "reranker-calibration.json"
    calibration = json.loads(calibration_path.read_text(encoding="utf-8"))
    if calibration != stage["calibration"]:
        raise RuntimeError("Persisted calibration report differs from the stage metadata")
    expected_hash = stage["calibration"].get("scoreCacheSha256") or args.dev_scores_sha256
    if args.dev_scores_sha256 and stage["calibration"].get("scoreCacheSha256") and args.dev_scores_sha256 != expected_hash:
        raise RuntimeError("Explicit cache digest conflicts with the stage manifest")
    cross_scores = load_dev_cache(cache_path, expected_hash, dev, calibration)
    kind = QDA_FUSION_KIND if args.kind == "qda" else FUSION_KIND
    feature_policy = QDA_FUSION_POLICY if args.kind == "qda" else FUSION_POLICY
    plan = dict(kind=kind, shrink=FUSION_SHRINK, featurePolicy=feature_policy, split="dev",
                sourceModelVersion=original["modelVersion"], sourceDatasetSha256=original["datasetSha256"],
                sourceCrossScoresSha256=expected_hash, cpuThreads=args.threads, trainingPerformed=False,
                heldOutScored=False, functionalBenchmarkScored=False, resubstitution=True,
                thresholdSelection="pair-F1-then-precision-then-recall")
    # Freeze the complete source stage independently of the new composition.
    shutil.copytree(source, output, ignore=shutil.ignore_patterns("source", "__pycache__"))
    if (source / "source").is_dir():
        shutil.copytree(source / "source", output / "ranked-source")
    shutil.copy2(metadata_path, output / "ranked-metadata.json")
    save_json(output / "fusion-preparation-plan.json", plan)
    save_json(output / "runState.json", dict(state="preparing-fusion", **plan))
    source_hashes = {}
    (output / "source").mkdir()
    for name in SOURCE_FILES:
        shutil.copy2(ROOT / "ml" / name, output / "source" / name)
        source_hashes[name] = sha256_file(output / "source" / name)
    print(json.dumps(dict(phase="encode-dev-fusion", queries=len(dev["queries"]), documents=len(dev["documents"]), cpuThreads=args.threads)), flush=True)
    started = time.perf_counter()
    encoder = Encoder(source, threads=args.threads, policy=policy_from_metadata(original))
    # No role prefix, no wrapper stripping, no runtime dossier concatenation.
    query_vectors = encoder.encode([q["text"] for q in dev["queries"]])
    document_vectors = encoder.encode([d["text"] for d in dev["documents"]])
    dense_scores = query_vectors @ document_vectors.T
    if dense_scores.shape != cross_scores.shape or not np.isfinite(dense_scores).all():
        raise RuntimeError("Invalid frozen encoder DEV score matrix")
    np.savez_compressed(output / "fusion-dev-features.npz", encoderCosine=dense_scores, crossEncoderRawLogit=cross_scores,
                        queryIds=np.asarray([q["id"] for q in dev["queries"]], dtype=np.str_),
                        documentIds=np.asarray([d["id"] for d in dev["documents"]], dtype=np.str_))
    truth = relevance_matrix(dev["queries"], dev["documents"])
    features = np.stack([dense_scores.reshape(-1), cross_scores.reshape(-1)], axis=1)
    fitted = (fit_qda if args.kind == "qda" else fit_lda)(features, truth)
    fusion_scores = score_fusion(features, fitted).reshape(truth.shape)
    selection = threshold_from_scores(fusion_scores, truth)
    metrics = dict(resubstitution=True, heldOutScored=False, functionalBenchmarkScored=False,
                   description="Coefficients and cutoff both fitted on the same DEV pairs; no independent accuracy estimate",
                   queries=len(dev["queries"]), documents=len(dev["documents"]), documentPairs=int(truth.size),
                   dense=dict(thresholdSelection=threshold_from_scores(dense_scores, truth), ranking=retrieval_metrics(dense_scores, truth)),
                   cross=dict(thresholdSelection=calibration["thresholdSelection"], ranking=calibration["ranking"]),
                   fusion=dict(thresholdSelection=selection, ranking=retrieval_metrics(fusion_scores, truth)))
    new_stage = copy.deepcopy(stage)
    new_stage["scoreCalibration"] = dict(kind=kind, weights=fitted["weights"], bias=fitted["bias"],
                                          threshold=selection["threshold"], featurePolicy=feature_policy,
                                          shrink=FUSION_SHRINK, split="dev", statistics=fitted["statistics"],
                                          hashes=dict(datasetSha256=original["datasetSha256"], encodingFingerprint=fingerprint,
                                                      encoderWeightsSha256=original["weightsSha256"], rerankerWeightsSha256=stage["weightsSha256"],
                                                      sourceMetadataSha256=sha256_file(metadata_path), crossScoresSha256=expected_hash,
                                                      crossCalibrationSha256=sha256_file(calibration_path), devRecordsSha256=canonical_hash(dev),
                                                      denseScoresSha256=canonical_hash(dense_scores.tolist()), calibrationSourceSha256=source_hashes["prepare_fusion.py"]),
                                          DEVmetrics=metrics)
    if args.kind == "qda":
        new_stage["scoreCalibration"]["quadraticMatrix"] = fitted["quadraticMatrix"]
        new_stage["scoreCalibration"]["hashes"]["parametersSha256"] = calibration_parameters_hash(new_stage["scoreCalibration"])
    new_stage["version"] = "mmarco-minilm-" + version_fingerprint(new_stage)[:12]
    new_pipeline = canonical_hash(dict(encoderEncodingFingerprint=fingerprint, rerankerVersion=new_stage["version"]))
    result = copy.deepcopy(original)
    result.update(reranker=new_stage, pipelineFingerprint=new_pipeline,
                  modelVersion=original["encoderModelVersion"] + "-rank-" + new_pipeline[:12],
                  sourceHashes=source_hashes, rankedSourceHashes=original["sourceHashes"],
                  pipelineKind="frozen-task-encoder-plus-mmarco-dev-resubstitution-" + args.kind.upper() + "-calibration")
    result["limitations"] += ["Two-feature fusion coefficients and cutoff fitted on source DEV pairs with fixed 10% diagonal covariance shrinkage.",
                              "Reported fusion DEV metrics are resubstitution, not an independent test or production quality estimate."]
    save_json(output / "fusion-calibration.json", new_stage["scoreCalibration"])
    save_json(output / "metadata.json", result)
    validate_artifact(output, new_stage)
    save_json(output / "runState.json", dict(state="prepared-dev-fusion", modelVersion=result["modelVersion"],
                                            pipelineFingerprint=new_pipeline, elapsedSeconds=round(time.perf_counter() - started, 3), **plan))
    print(json.dumps(dict(phase="ready", output=str(output), modelVersion=result["modelVersion"],
                         rerankerVersion=new_stage["version"], threshold=selection["threshold"],
                         unchangedCrossEncoderThreshold=stage["threshold"], DEVmetrics=metrics)), flush=True)

if __name__ == "__main__":
    main()
