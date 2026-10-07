"""Prepare a NEW composition artifact; calibrate frozen reranker on DEV only.

No training or held-out/functional benchmark scoring happens here. The original
encoder weights, training sources, reports and threshold remain untouched.
"""
import argparse
import copy
import json
import shutil
import time
from pathlib import Path
import numpy as np
from huggingface_hub import snapshot_download
from common import ROOT, DIMENSION, canonical_hash, encoding_fingerprint, policy_from_metadata, sha256_file, relevance_matrix, threshold_from_scores, retrieval_metrics
from dataset_v2 import dataset_hash, records, validate
from reranker import BASE_MODEL, REVISION, WEIGHTS_SHA256, FILES, KNOWN_HASHES, POLICY, MAX_LENGTH, Reranker, document_context, version_fingerprint

CACHE_DIR = ROOT / "server/data/models/mmarco-minilm-reranker" / REVISION
ENCODER_FILES = ("model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt")

def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def download():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo_id=BASE_MODEL, revision=REVISION, local_dir=CACHE_DIR, allow_patterns=list(FILES))
    for name, digest in KNOWN_HASHES.items():
        if sha256_file(CACHE_DIR / name) != digest:
            raise RuntimeError("Downloaded file does not match the pinned reranker")
    return CACHE_DIR

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--encoder-model", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    if not (1 <= args.threads <= 64 and 1 <= args.batch_size <= 32):
        parser.error("Invalid CPU or batch configuration")
    source, output = args.encoder_model.resolve(), args.output.resolve()
    if output.exists() or output == source or source in output.parents:
        raise RuntimeError("Use a new output directory outside the frozen encoder artifact")
    original = json.loads((source / "metadata.json").read_text(encoding="utf-8"))
    if not original.get("trained") or original["dimension"] != DIMENSION or original.get("reranker"):
        raise RuntimeError("Expected the original trained encoder artifact")
    if original["weightsSha256"] != sha256_file(source / "model.safetensors"):
        raise RuntimeError("Original encoder weights do not match metadata")
    encoder_fingerprint = encoding_fingerprint(original["weightsSha256"], policy_from_metadata(original))
    if original["encodingFingerprint"] != encoder_fingerprint:
        raise RuntimeError("Original encoder inference policy does not match its fingerprint")
    dataset_path = (source / original["datasetSnapshot"]).resolve()
    dataset_path.relative_to(source)
    value = json.loads(dataset_path.read_text(encoding="utf-8"))
    validate(value)
    if dataset_hash(value) != original["datasetSha256"]:
        raise RuntimeError("Original dataset snapshot does not match its manifest")
    dev = records("dev", value)
    if any(d["split"] == "test" for d in dev["documents"]) or any(q["split"] != "dev" for q in dev["queries"]):
        raise RuntimeError("Calibration must not use held-out records")
    plan = dict(baseModel=BASE_MODEL, revision=REVISION, policy=POLICY, datasetSha256=dataset_hash(value),
                split="dev", thresholdSelection="pair-F1-then-precision-then-recall", cpuThreads=args.threads,
                batchSize=args.batch_size, trainedHere=False, heldOutScored=False, functionalBenchmarkScored=False)
    output.mkdir(parents=True)
    save_json(output / "preparation-plan.json", plan)
    save_json(output / "runState.json", dict(state="preparing-reranker", **plan))
    for name in ENCODER_FILES:
        if not (source / name).is_file():
            raise RuntimeError("Original encoder is missing an inference asset")
        shutil.copy2(source / name, output / name)
    shutil.copy2(dataset_path, output / "dataset.json")
    save_json(output / "encoder-metadata.json", original)
    if (source / "evaluation.json").exists():
        shutil.copy2(source / "evaluation.json", output / "encoder-evaluation.json")
    if (source / "source").is_dir():
        shutil.copytree(source / "source", output / "encoder-source")
    pipeline_source = output / "source"
    pipeline_source.mkdir()
    source_hashes = {}
    for name in ("common.py", "dataset.py", "dataset_v2.py", "reranker.py", "prepare_reranker.py", "worker.py", "check_worker.py", "requirements.txt"):
        shutil.copy2(ROOT / "ml" / name, pipeline_source / name)
        source_hashes[name] = sha256_file(pipeline_source / name)
    print(json.dumps(dict(phase="download-reranker", baseModel=BASE_MODEL, revision=REVISION)), flush=True)
    cache = download()
    rank_path = output / "reranker"
    rank_path.mkdir()
    for name in FILES:
        shutil.copy2(cache / name, rank_path / name)
    file_hashes = {name: sha256_file(rank_path / name) for name in FILES}
    save_json(rank_path / "provenance.json", dict(baseModel=BASE_MODEL, revision=REVISION, license="Apache-2.0", fileHashes=file_hashes,
                                                  modelCard="https://huggingface.co/" + BASE_MODEL + "/blob/" + REVISION + "/README.md"))
    print(json.dumps(dict(phase="load-reranker", cpuThreads=args.threads, batchSize=args.batch_size)), flush=True)
    reranker = Reranker(rank_path, threads=args.threads, batch_size=args.batch_size)
    texts = [document_context(d["role"], d["text"]) for d in dev["documents"]]
    started, scores = time.perf_counter(), []
    for index, query in enumerate(dev["queries"]):
        def progress(done, total):
            if done == total:
                print(json.dumps(dict(phase="dev-calibration", query=index + 1, queries=len(dev["queries"]),
                                      scoredPairs=index * len(texts) + done, totalPairs=len(texts) * len(dev["queries"]),
                                      elapsedSeconds=round(time.perf_counter() - started, 2))), flush=True)
        scores.append(reranker.score(query["text"], texts, progress=progress))
    scores = np.stack(scores)
    truth = relevance_matrix(dev["queries"], dev["documents"])
    selection = threshold_from_scores(scores, truth)
    calibration = dict(datasetSha256=dataset_hash(value), split="dev", documents=len(texts),
                       positiveQueries=sum(bool(q["relevant"]) for q in dev["queries"]),
                       unknownQueries=sum(not q["relevant"] for q in dev["queries"]), documentPairs=int(scores.size),
                       thresholdSelection=selection, ranking=retrieval_metrics(scores, truth), policy=POLICY,
                       cpuThreads=args.threads, batchSize=args.batch_size, elapsedSeconds=round(time.perf_counter() - started, 3),
                       heldOutScored=False, functionalBenchmarkScored=False,
                       provenance="DEV engineering calibration; source TEST was already viewed for the encoder and is not an independent new pipeline test")
    np.savez_compressed(output / "reranker-dev-scores.npz", scores=scores,
                        queryIds=np.asarray([q["id"] for q in dev["queries"]], dtype=np.str_),
                        documentIds=np.asarray([d["id"] for d in dev["documents"]], dtype=np.str_))
    calibration["scoreCacheSha256"] = sha256_file(output / "reranker-dev-scores.npz")
    save_json(output / "reranker-calibration.json", calibration)
    stage = dict(baseModel=BASE_MODEL, revision=REVISION, license="Apache-2.0", weightsSha256=WEIGHTS_SHA256,
                 fileHashes=file_hashes, path="reranker", maxLength=MAX_LENGTH, policy=POLICY,
                 threshold=selection["threshold"], calibration=calibration, trainedHere=False)
    stage["version"] = "mmarco-minilm-" + version_fingerprint(stage)[:12]
    pipeline_fingerprint = canonical_hash(dict(encoderEncodingFingerprint=encoder_fingerprint, rerankerVersion=stage["version"]))
    metadata = copy.deepcopy(original)
    metadata.update(encoderModelVersion=original["modelVersion"], encoderSourceHashes=original["sourceHashes"],
                    sourceHashes=source_hashes, datasetSnapshot="dataset.json", reranker=stage, pipelineFingerprint=pipeline_fingerprint,
                    modelVersion=original["modelVersion"] + "-rank-" + pipeline_fingerprint[:12],
                    pipelineKind="trained-rubert-encoder-plus-frozen-mmarco-cross-encoder-dev-calibration")
    metadata["limitations"] = original["limitations"] + ["Reranker weights are pretrained mMARCO weights, not fine-tuned on this project.",
        "Reranker cutoff uses source DEV document pairs only; no new independent pipeline TEST evaluation is claimed.",
        "Runtime passage aggregation and first-stage recall require separate functional validation."]
    save_json(output / "metadata.json", metadata)
    save_json(output / "runState.json", dict(state="prepared-dev-calibrated", modelVersion=metadata["modelVersion"],
                                            encodingFingerprint=encoder_fingerprint, pipelineFingerprint=pipeline_fingerprint,
                                            devDatasetSha256=dataset_hash(value), heldOutScored=False))
    print(json.dumps(dict(phase="ready", modelVersion=metadata["modelVersion"], rerankerVersion=stage["version"],
                         threshold=stage["threshold"], output=str(output), calibration=selection)), flush=True)

if __name__ == "__main__":
    main()
