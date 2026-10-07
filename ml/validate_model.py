"""Validate a local model manifest before activation, without loading models."""
import argparse
import json
import math
from pathlib import Path
from common import DIMENSION, canonical_hash, encoding_fingerprint, policy_from_metadata, sha256_file


def validate_model(path):
    path = Path(path).resolve()
    metadata = json.loads((path / "metadata.json").read_text(encoding="utf-8"))
    if not metadata.get("trained") or metadata.get("dimension") != DIMENSION:
        raise ValueError("Expected a trained encoder")
    threshold = metadata.get("threshold")
    if not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or not -1 <= threshold <= 1:
        raise ValueError("Invalid encoder cutoff")
    weights_hash = sha256_file(path / "model.safetensors")
    if metadata.get("weightsSha256") != weights_hash:
        raise ValueError("Encoder weights do not match the manifest")
    fingerprint = encoding_fingerprint(weights_hash, policy_from_metadata(metadata))
    if metadata.get("encodingFingerprint", fingerprint) != fingerprint:
        raise ValueError("Encoder policy does not match its fingerprint")
    if "reranker" in metadata:
        from reranker import validate_artifact
        stage = metadata["reranker"]
        validate_artifact(path, stage)
        if "scoreCalibration" in stage:
            hashes = stage["scoreCalibration"]["hashes"]
            if hashes["encodingFingerprint"] != fingerprint or hashes["encoderWeightsSha256"] != weights_hash:
                raise ValueError("Score calibration belongs to another encoder")
        pipeline = canonical_hash(dict(encoderEncodingFingerprint=fingerprint, rerankerVersion=stage["version"]))
        if metadata.get("pipelineFingerprint") != pipeline or metadata.get("modelVersion") != metadata.get("encoderModelVersion", "") + "-rank-" + pipeline[:12]:
            raise ValueError("Composite model does not match its fingerprint")
    return metadata["modelVersion"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(dict(validated=True, modelVersion=validate_model(args.model))))
