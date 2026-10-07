"""Local persistent JSONL embedding worker. Stdout is exclusively the protocol."""
import argparse
from collections import deque
import json
import sys
import time
import numpy as np
from common import Encoder, MODEL_DIR, DIMENSION, sha256_file, encoding_fingerprint, policy_from_metadata, canonical_hash

def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(MODEL_DIR))
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    from pathlib import Path
    model_dir = Path(args.model)
    metadata = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    if not metadata.get("trained") or metadata["dimension"] != DIMENSION:
        raise ValueError("Expected the trained 312-dimensional encoder artifact")
    if sha256_file(model_dir / "model.safetensors") != metadata["weightsSha256"]:
        raise ValueError("Model weight hash does not match metadata")
    policy = policy_from_metadata(metadata)
    fingerprint = encoding_fingerprint(metadata["weightsSha256"], policy)
    if metadata.get("encodingFingerprint", fingerprint) != fingerprint:
        raise ValueError("Encoding policy fingerprint does not match metadata")
    encoder = Encoder(model_dir, threads=args.threads)
    reranker = None
    reranker_metadata = metadata.get("reranker")
    if reranker_metadata:
        from reranker import Reranker, validate_artifact
        reranker_path = validate_artifact(model_dir, reranker_metadata)
        calibration = reranker_metadata.get("scoreCalibration")
        if calibration and (calibration["hashes"]["encodingFingerprint"] != fingerprint
                            or calibration["hashes"]["encoderWeightsSha256"] != metadata["weightsSha256"]
                            or calibration["hashes"]["datasetSha256"] != metadata["datasetSha256"]):
            raise ValueError("Fusion calibration does not match the frozen encoder")
        pipeline = canonical_hash(dict(encoderEncodingFingerprint=fingerprint, rerankerVersion=reranker_metadata["version"]))
        if metadata.get("pipelineFingerprint") != pipeline or metadata["modelVersion"] != metadata["encoderModelVersion"] + "-rank-" + pipeline[:12]:
            raise ValueError("Composite model fingerprint does not match its stages")
        reranker = Reranker(reranker_path, threads=args.threads)
    durations = deque(maxlen=200)
    reranker_durations = deque(maxlen=200)
    for line in sys.stdin:
        identifier = None
        try:
            if len(line) > 4 * 1024 * 1024:
                raise ValueError("Request exceeds four MiB")
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("Expected a JSON object")
            identifier = request.get("id")
            if request.get("kind") == "health":
                response = dict(id=identifier, dimension=DIMENSION, modelVersion=metadata["modelVersion"],
                                trained=True, baseModel=metadata["baseModel"], license=metadata["license"],
                                threshold=metadata["threshold"], maxSequenceLength=policy["maxLength"],
                                encodingPolicy=policy, encodingFingerprint=fingerprint,
                                cpuThreads=args.threads, batchSize=16,
                                p95LatencyMs=round(float(np.percentile(durations, 95)), 3) if durations else None,
                                latencySamples=len(durations))
                if reranker_metadata:
                    response["reranker"] = reranker_metadata
                    response["encoderModelVersion"] = metadata["encoderModelVersion"]
                    response["pipelineFingerprint"] = metadata["pipelineFingerprint"]
                    response["rerankerP95LatencyMs"] = round(float(np.percentile(reranker_durations, 95)), 3) if reranker_durations else None
                    response["rerankerLatencySamples"] = len(reranker_durations)
            elif request.get("kind") == "rerank":
                query, texts = request.get("query"), request.get("texts")
                if reranker is None or not isinstance(query, str) or len(query) > 1200:
                    raise ValueError("Invalid or unavailable reranking request")
                if not isinstance(texts, list) or len(texts) > 256 or any(not isinstance(t, str) or len(t) > 12000 for t in texts):
                    raise ValueError("Invalid reranking documents")
                started = time.perf_counter()
                scores = reranker.score(query, texts)
                reranker_durations.append((time.perf_counter() - started) * 1000)
                response = dict(id=identifier, scores=scores.tolist())
            else:
                texts = request.get("texts")
                if not isinstance(texts, list) or len(texts) > 256:
                    raise ValueError("texts must be an array of at most 256 strings")
                if any(not isinstance(text, str) or len(text) > 12000 for text in texts):
                    raise ValueError("Each text must be a string of at most 12000 characters")
                started = time.perf_counter()
                vectors = encoder.encode(texts, batch_size=16)
                durations.append((time.perf_counter() - started) * 1000)
                response = dict(id=identifier, vectors=vectors.tolist())
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            # Do not log or echo professional texts or raw requests.
            response = dict(id=identifier, error="invalid_request")
        except Exception:
            response = dict(id=identifier, error="embedding_failed")
        print(json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)

if __name__ == "__main__":
    main()
