"""Shared, versioned encoding and explicit-qrels retrieval implementation."""
import hashlib
import json
import re
from pathlib import Path
import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "server/data/semantic-model"
MAX_LENGTH = 192  # Legacy artifacts retain their original inference policy.
DIMENSION = 312
LEGACY_POLICY = dict(pooling="CLS", maxLength=192, stride=0, chunking=False, aggregation="none", normalization="L2")
TASK_POLICY = dict(pooling="CLS", maxLength=256, stride=64, chunking=True, aggregation="mean-normalized-chunks", normalization="L2")

def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()

def encoding_fingerprint(weights_hash, policy):
    return canonical_hash(dict(weightsSha256=weights_hash, encodingPolicy=policy))

def policy_from_metadata(metadata):
    if "encodingPolicy" in metadata:
        return validate_policy(metadata["encodingPolicy"])
    return validate_policy({**LEGACY_POLICY, "maxLength": metadata.get("maxSequenceLength", MAX_LENGTH)})

def validate_policy(policy):
    policy = dict(policy)
    assert policy.get("pooling") == "CLS" and policy.get("normalization") == "L2"
    assert type(policy.get("maxLength")) is int and 16 <= policy["maxLength"] <= 2048
    assert type(policy.get("stride")) is int and 0 <= policy["stride"] < policy["maxLength"] - 2
    assert type(policy.get("chunking")) is bool
    assert policy.get("aggregation") == ("mean-normalized-chunks" if policy["chunking"] else "none")
    return policy

class Encoder:
    def __init__(self, path, threads=4, policy=None):
        torch.set_num_threads(threads)
        path = Path(path)
        if policy is None:
            metadata = path / "metadata.json"
            policy = policy_from_metadata(json.loads(metadata.read_text(encoding="utf-8"))) if metadata.exists() else LEGACY_POLICY
        self.policy = validate_policy(policy)
        self.tokenizer = AutoTokenizer.from_pretrained(str(path), local_files_only=True, trust_remote_code=False)
        self.model = AutoModel.from_pretrained(str(path), local_files_only=True, trust_remote_code=False, use_safetensors=True)
        self.model.eval()

    def forward(self, texts):
        if not texts:
            return torch.empty((0, DIMENSION), device=next(self.model.parameters()).device)
        options = dict(padding=True, truncation=True, max_length=self.policy["maxLength"], return_tensors="pt")
        if self.policy["chunking"]:
            options.update(return_overflowing_tokens=True, stride=self.policy["stride"])
        tokens = self.tokenizer(texts, **options)
        mapping = tokens.pop("overflow_to_sample_mapping", None)
        device = next(self.model.parameters()).device
        tokens = {key: value.to(device) for key, value in tokens.items()}
        count = tokens["input_ids"].shape[0]
        chunks = []
        # Limit chunk forwards for long documents; short batches use one pass.
        # index_add aggregation below remains differentiable for fine-tuning.
        for offset in range(0, count, 64):
            batch = {key: value[offset:offset + 64] for key, value in tokens.items()}
            cls = self.model(**batch).last_hidden_state[:, 0, :]
            chunks.append(torch.nn.functional.normalize(cls, p=2, dim=1))
        vectors = torch.cat(chunks, dim=0)
        if mapping is None:
            return vectors
        mapping = mapping.to(device)
        summed = torch.zeros((len(texts), vectors.shape[1]), dtype=vectors.dtype, device=device).index_add(0, mapping, vectors)
        counts = torch.bincount(mapping, minlength=len(texts)).to(vectors.dtype).clamp_min(1).unsqueeze(1)
        return torch.nn.functional.normalize(summed / counts, p=2, dim=1)

    def encode(self, texts, batch_size=16):
        if not texts:
            return np.empty((0, DIMENSION), dtype=np.float32)
        self.model.eval()
        with torch.inference_mode():
            vectors = [self.forward(texts[i:i + batch_size]).cpu().numpy() for i in range(0, len(texts), batch_size)]
        return np.concatenate(vectors).astype(np.float32)

    def save(self, path):
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        self.model.save_pretrained(path, safe_serialization=True)
        self.tokenizer.save_pretrained(path)

def tokenize(text):
    return re.findall(r"[\w]+", text.lower().replace("ё", "е"))

def lexical_scores(queries, documents):
    """BM25 baseline: no professional role or task synonym lookup."""
    docs = [tokenize(text) for text in documents]
    frequency = {}
    for terms in docs:
        for term in set(terms):
            frequency[term] = frequency.get(term, 0) + 1
    average_length = max(1., sum(map(len, docs)) / max(1, len(docs)))
    scores = np.zeros((len(queries), len(docs)))
    for i, query in enumerate(queries):
        for j, terms in enumerate(docs):
            for term in set(tokenize(query)):
                count = terms.count(term)
                if count:
                    idf = np.log(1 + (len(docs) - frequency.get(term, 0) + .5) / (frequency.get(term, 0) + .5))
                    scores[i, j] += idf * count * 2.5 / (count + 1.5 * (.25 + .75 * len(terms) / average_length))
    return scores

def relevance_matrix(queries, documents):
    return np.asarray([[doc["id"] in set(query["relevant"]) for doc in documents] for query in queries], dtype=bool)

def retrieval_metrics(scores, relevant):
    assert scores.shape == relevant.shape
    totals = dict(mrrAt10=0., ndcgAt5=0., recallAt5=0., precisionAt5=0., top1Accuracy=0.)
    gaps, count = [], 0
    for row, truth in zip(scores, relevant):
        if not truth.any():
            continue
        order = np.argsort(-row, kind="stable")
        ranked = truth[order]
        matches = np.flatnonzero(ranked[:10])
        totals["mrrAt10"] += 1. / (matches[0] + 1) if len(matches) else 0.
        discount = 1. / np.log2(np.arange(min(5, len(row))) + 2)
        ideal = discount[:min(5, int(truth.sum()))].sum()
        totals["ndcgAt5"] += np.dot(ranked[:5], discount) / ideal
        totals["recallAt5"] += ranked[:5].sum() / truth.sum()
        totals["precisionAt5"] += ranked[:5].sum() / min(5, len(ranked))
        totals["top1Accuracy"] += int(ranked[0])
        if (~truth).any():
            gaps.append(float(row[truth].max() - row[~truth].max()))
        count += 1
    metrics = {key: round(float(value) / max(1, count), 6) for key, value in totals.items()}
    metrics["meanPositiveMinusHardNegative"] = round(float(np.mean(gaps)), 6) if gaps else 0.
    return metrics

def evaluate_split(encoder, data, lexical=False):
    documents, queries = data["documents"], data["queries"]
    scores = lexical_scores([q["text"] for q in queries], [d["text"] for d in documents]) if lexical else encoder.encode([q["text"] for q in queries]) @ encoder.encode([d["text"] for d in documents]).T
    return retrieval_metrics(scores, relevance_matrix(queries, documents)), scores

def threshold_metrics(scores, relevant, threshold):
    predicted = scores >= threshold
    tp = int((predicted & relevant).sum()); fp = int((predicted & ~relevant).sum())
    fn = int((~predicted & relevant).sum()); tn = int((~predicted & ~relevant).sum())
    precision = tp / max(1, tp + fp); recall = tp / max(1, tp + fn)
    return dict(threshold=float(threshold), precision=precision, recall=recall,
                f1=2 * tp / max(1, 2 * tp + fp + fn), balancedAccuracy=.5 * (recall + tn / max(1, tn + fp)),
                truePositive=tp, falsePositive=fp, falseNegative=fn, trueNegative=tn)

def threshold_from_scores(scores, relevant):
    """Select on dev document pairs, never on scope-query maximum scores."""
    values = scores.reshape(-1)
    order = np.argsort(-values, kind="stable")
    truth = relevant.reshape(-1)[order]
    sorted_scores = values[order]
    tp_cumulative = np.cumsum(truth); fp_cumulative = np.cumsum(~truth)
    ends = np.r_[np.flatnonzero(sorted_scores[:-1] != sorted_scores[1:]), len(values) - 1]
    positives = int(truth.sum())
    choices = [(0., 0., 0., float(sorted_scores[0]) + 1e-6)]
    for index in ends:
        tp, fp = int(tp_cumulative[index]), int(fp_cumulative[index])
        precision = tp / max(1, tp + fp); recall = tp / max(1, positives)
        f1 = 2 * tp / max(1, 2 * tp + fp + positives - tp)
        cutoff = float(sorted_scores[index]) - 1e-7 if index == len(values) - 1 else .5 * float(sorted_scores[index] + sorted_scores[index + 1])
        choices.append((f1, precision, recall, cutoff))
    chosen = max(choices)[3]
    return {**threshold_metrics(scores, relevant, chosen), "criterion": "pair-level-F1-then-precision-then-recall"}
