"""Pinned Apache-2.0 mMARCO cross-encoder, local CPU inference only."""
from pathlib import Path
import math
import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from common import canonical_hash, sha256_file

BASE_MODEL = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
REVISION = "1427fd652930e4ba29e8149678df786c240d8825"
WEIGHTS_SHA256 = "5daeca2481a76b5976a2bdc32f0a78532b6716da4f8cd3ff59460ef8d2f359b4"
MAX_LENGTH = 512
FILES = ("config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json",
         "special_tokens_map.json", "sentencepiece.bpe.model", "README.md")
KNOWN_HASHES = {
    "config.json": "cc2cfe51aa3fd759d21d21acf5dfd6994aa67a3c9210636d22e143699d336c77",
    "model.safetensors": WEIGHTS_SHA256,
    "tokenizer.json": "62c24cdc13d4c9952d63718d6c9fa4c287974249e16b7ade6d5a85e7bbb75626",
    "sentencepiece.bpe.model": "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865",
    "tokenizer_config.json": "e7fbfbfa6347b4e414c1cee50d142e2c2f9a895dad68b068ae83a8b564c3837e",
    "special_tokens_map.json": "378eb3bf733eb16e65792d7e3fda5b8a4631387ca04d2015199c4d4f22ae554d",
    "README.md": "474736a65d6393a060119a8dc304563af67af4d8d86ccfee4a05dd0df107fc11",
}
ROLE_LABELS = {
    "Frontend": "Frontend-разработчик", "Backend": "Backend-разработчик", "Fullstack": "Fullstack-разработчик",
    "Mobile": "Мобильный разработчик", "ML": "Специалист по машинному обучению", "DataAnalysis": "Аналитик данных",
    "DataEngineering": "Инженер данных", "DevOps": "DevOps-инженер", "QA": "Инженер по тестированию",
    "Security": "Специалист по информационной безопасности", "UXUI": "UX/UI-дизайнер",
    "BusinessAnalysis": "Бизнес и системный аналитик", "ProductManagement": "Менеджер продукта",
    "Embedded": "Инженер встраиваемых систем и электроники",
}
POLICY = dict(maxLength=MAX_LENGTH, truncation="longest-first", padding="longest-in-batch", output="raw-logit",
              queryContext="raw-query", documentContext="catalog-professional-role-newline-task-section")
FUSION_KIND = "pooled-LDA-diagonal-shrinkage-v1"
QDA_FUSION_KIND = "class-QDA-diagonal-shrinkage-v1"
ADMISSION_KIND = "query-max-applicability-top3-v1"
FUSION_SHRINK = .1
FUSION_POLICY = dict(features=["encoderCosine", "crossEncoderRawLogit"],
                     encoderQueryContext="raw-query", encoderDocumentContext="task-section-without-role",
                     crossEncoderQueryContext="raw-query", crossEncoderDocumentContext=POLICY["documentContext"],
                     aggregation="maximum-fused-score-over-task-sections",
                     formula="weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias")
QDA_FUSION_POLICY = {**FUSION_POLICY,
                     "formula": "features^T*quadraticMatrix*features+weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias"}

def document_context(role, text):
    return ROLE_LABELS[role] + "\n" + text

def version_fingerprint(metadata):
    payload = dict(baseModel=metadata["baseModel"], revision=metadata["revision"],
                   weightsSha256=metadata["weightsSha256"], fileHashes=metadata["fileHashes"],
                   policy=metadata["policy"], threshold=metadata["threshold"],
                   calibrationDatasetSha256=metadata["calibration"]["datasetSha256"])
    # Do not change the identity of an existing artifact without fusion.
    if "scoreCalibration" in metadata:
        payload["scoreCalibration"] = metadata["scoreCalibration"]
    return canonical_hash(payload)

def calibration_parameters_hash(value):
    payload = {key: value[key] for key in ("kind", "weights", "bias", "threshold", "shrink", "featurePolicy")}
    if "quadraticMatrix" in value:
        payload["quadraticMatrix"] = value["quadraticMatrix"]
    return canonical_hash(payload)

def validate_admission(value, calibration):
    if not isinstance(value, dict) or value.get("kind") != ADMISSION_KIND or value.get("split") != "dev":
        raise ValueError("Unexpected admission calibration policy")
    if type(value.get("limit")) is not int or value["limit"] != 3:
        raise ValueError("Admission fallback must have the fixed top-three limit")
    if type(value.get("threshold")) not in (int, float) or not math.isfinite(value["threshold"]) or value["threshold"] >= calibration["threshold"]:
        raise ValueError("Expected a finite admission floor below the unchanged pair cutoff")
    metrics = value.get("metrics")
    if not isinstance(metrics, dict) or metrics.get("resubstitution") is not True or metrics.get("heldOutScored") is not False or metrics.get("functionalBenchmarkScored") is not False:
        raise ValueError("Admission metrics must declare DEV-only resubstitution")
    hashes = value.get("hashes")
    required = {"datasetSha256", "encodingFingerprint", "sourceMetadataSha256", "devRecordsSha256", "denseScoresSha256",
                "crossScoresSha256", "featureCacheSha256", "sourceCalibrationSha256", "calibrationSourceSha256"}
    if not isinstance(hashes, dict) or set(hashes) != required or any(not isinstance(h, str) or len(h) != 64 or any(c not in "0123456789abcdef" for c in h) for h in hashes.values()):
        raise ValueError("Invalid admission provenance hashes")
    for key in ("datasetSha256", "encodingFingerprint", "devRecordsSha256", "denseScoresSha256", "crossScoresSha256"):
        if hashes[key] != calibration["hashes"][key]:
            raise ValueError("Admission calibration belongs to another feature snapshot")
    original_calibration = {key: item for key, item in calibration.items() if key != "admission"}
    if hashes["sourceCalibrationSha256"] != canonical_hash(original_calibration):
        raise ValueError("Admission floor does not belong to the unchanged frozen pair calibration")
    return value

def validate_score_calibration(value, metadata):
    policies = {FUSION_KIND: FUSION_POLICY, QDA_FUSION_KIND: QDA_FUSION_POLICY}
    if not isinstance(value, dict) or value.get("kind") not in policies or value.get("featurePolicy") != policies[value["kind"]]:
        raise ValueError("Unexpected fusion calibration policy")
    if value.get("split") != "dev" or type(value.get("shrink")) not in (int, float) or value["shrink"] != FUSION_SHRINK:
        raise ValueError("Fusion must use the fixed DEV-only shrinkage policy")
    weights = value.get("weights")
    if not isinstance(weights, list) or len(weights) != 2 or any(type(w) not in (int, float) or not math.isfinite(w) for w in weights):
        raise ValueError("Expected two finite fusion coefficients")
    if any(type(value.get(key)) not in (int, float) or not math.isfinite(value[key]) for key in ("bias", "threshold")):
        raise ValueError("Expected finite fusion intercept and cutoff")
    if value["kind"] == QDA_FUSION_KIND:
        matrix = value.get("quadraticMatrix")
        if not isinstance(matrix, list) or len(matrix) != 2 or any(not isinstance(row, list) or len(row) != 2 for row in matrix):
            raise ValueError("Expected a two-by-two QDA matrix")
        if any(type(coefficient) not in (int, float) or not math.isfinite(coefficient) for row in matrix for coefficient in row) or matrix[0][1] != matrix[1][0]:
            raise ValueError("QDA matrix must be finite and symmetric")
    elif "quadraticMatrix" in value:
        raise ValueError("A linear calibration must not contain a quadratic matrix")
    hashes = value.get("hashes")
    required = {"datasetSha256", "encodingFingerprint", "encoderWeightsSha256", "rerankerWeightsSha256",
                "sourceMetadataSha256", "crossScoresSha256", "crossCalibrationSha256", "devRecordsSha256",
                "denseScoresSha256", "calibrationSourceSha256"}
    if value["kind"] == QDA_FUSION_KIND:
        required.add("parametersSha256")
    if not isinstance(hashes, dict) or set(hashes) != required or any(not isinstance(h, str) or len(h) != 64 or any(c not in "0123456789abcdef" for c in h) for h in hashes.values()):
        raise ValueError("Invalid fusion provenance hashes")
    if hashes["datasetSha256"] != metadata["calibration"]["datasetSha256"] or hashes["rerankerWeightsSha256"] != metadata["weightsSha256"]:
        raise ValueError("Fusion calibration belongs to another stage or dataset")
    if value["kind"] == QDA_FUSION_KIND and hashes["parametersSha256"] != calibration_parameters_hash(value):
        raise ValueError("QDA parameter hash does not match its coefficients and cutoff")
    metrics = value.get("DEVmetrics")
    if not isinstance(metrics, dict) or metrics.get("resubstitution") is not True or metrics.get("heldOutScored") is not False:
        raise ValueError("Fusion DEV metrics must declare resubstitution and no held-out scoring")
    if "admission" in value:
        validate_admission(value["admission"], value)
    return value

def validate_artifact(model_dir, metadata):
    model_dir = Path(model_dir).resolve()
    if metadata["baseModel"] != BASE_MODEL or metadata["revision"] != REVISION or metadata["weightsSha256"] != WEIGHTS_SHA256:
        raise ValueError("Unexpected reranker model or revision")
    if metadata["maxLength"] != MAX_LENGTH or metadata["policy"] != POLICY or not math.isfinite(metadata["threshold"]):
        raise ValueError("Unexpected reranker inference policy")
    relative = Path(metadata["path"])
    if relative.is_absolute():
        raise ValueError("Reranker path must be inside the artifact")
    path = (model_dir / relative).resolve()
    path.relative_to(model_dir)
    if path == model_dir:
        raise ValueError("Reranker needs its own artifact subdirectory")
    if set(metadata["fileHashes"]) != set(FILES):
        raise ValueError("Unexpected reranker file manifest")
    for name in FILES:
        digest = sha256_file(path / name)
        if digest != metadata["fileHashes"][name] or (name in KNOWN_HASHES and digest != KNOWN_HASHES[name]):
            raise ValueError("Reranker file does not match the frozen manifest")
    if "scoreCalibration" in metadata:
        validate_score_calibration(metadata["scoreCalibration"], metadata)
    fingerprint = version_fingerprint(metadata)
    if metadata["version"] != "mmarco-minilm-" + fingerprint[:12]:
        raise ValueError("Reranker version fingerprint does not match its policy")
    return path

class Reranker:
    def __init__(self, path, threads=8, batch_size=16):
        if not (1 <= threads <= 64 and 1 <= batch_size <= 32):
            raise ValueError("Invalid CPU or batch configuration")
        torch.set_num_threads(threads)
        self.batch_size = batch_size
        self.tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True, use_fast=True, trust_remote_code=False)
        self.model = AutoModelForSequenceClassification.from_pretrained(path, local_files_only=True,
                                                                        use_safetensors=True, trust_remote_code=False)
        if self.model.config.model_type != "xlm-roberta" or self.model.config.num_labels != 1:
            raise ValueError("Expected the single-logit XLM-RoBERTa cross-encoder")
        self.model.eval()

    def score(self, query, texts, progress=None):
        if not isinstance(query, str) or len(query) > 1200 or not isinstance(texts, list) or len(texts) > 256:
            raise ValueError("Invalid reranking query")
        if any(not isinstance(text, str) or len(text) > 12000 for text in texts):
            raise ValueError("Invalid reranking documents")
        if not texts:
            return np.empty(0, dtype=np.float32)
        output = []
        with torch.inference_mode():
            for offset in range(0, len(texts), self.batch_size):
                batch = texts[offset:offset + self.batch_size]
                tokens = self.tokenizer([query] * len(batch), batch, padding=True, truncation=True,
                                        max_length=MAX_LENGTH, return_tensors="pt")
                logits = self.model(**tokens).logits
                if logits.shape != (len(batch), 1):
                    raise ValueError("Unexpected cross-encoder logit shape")
                output.append(logits[:, 0].cpu().numpy().astype(np.float32))
                if progress:
                    progress(min(offset + len(batch), len(texts)), len(texts))
        scores = np.concatenate(output)
        if not np.isfinite(scores).all():
            raise ValueError("Cross-encoder produced non-finite scores")
        return scores
