"""One embedding implementation shared by training, evaluation and inference."""
import hashlib
import re
from pathlib import Path
import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "server/data/semantic-model"
MAX_LENGTH = 192
DIMENSION = 312

def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

class Encoder:
    def __init__(self, path, threads=4):
        torch.set_num_threads(threads)
        self.tokenizer = AutoTokenizer.from_pretrained(str(path), local_files_only=True, trust_remote_code=False)
        self.model = AutoModel.from_pretrained(str(path), local_files_only=True, trust_remote_code=False, use_safetensors=True)
        self.model.eval()

    def forward(self, texts):
        batch = self.tokenizer(texts, padding=True, truncation=True, max_length=MAX_LENGTH, return_tensors="pt")
        output = self.model(**batch).last_hidden_state[:, 0, :]
        return torch.nn.functional.normalize(output, p=2, dim=1)

    def encode(self, texts, batch_size=16):
        if not texts:
            return np.empty((0, DIMENSION), dtype=np.float32)
        self.model.eval()
        with torch.inference_mode():
            vectors = [self.forward(texts[i:i + batch_size]).cpu().numpy() for i in range(0, len(texts), batch_size)]
        return np.concatenate(vectors).astype(np.float32)

    def save(self, path):
        path.mkdir(parents=True, exist_ok=True)
        self.model.save_pretrained(path, safe_serialization=True)
        self.tokenizer.save_pretrained(path)

def tokenize(text):
    return re.findall(r"[\w]+", text.lower().replace("ё", "е"))

def lexical_scores(queries, documents):
    """BM25 baseline with the same query/corpus and no task-specific synonym table."""
    docs = [tokenize(text) for text in documents]
    document_frequency = {}
    for tokens in docs:
        for term in set(tokens):
            document_frequency[term] = document_frequency.get(term, 0) + 1
    average_length = sum(map(len, docs)) / max(1, len(docs))
    scores = np.zeros((len(queries), len(docs)))
    for i, query in enumerate(queries):
        for j, terms in enumerate(docs):
            for term in set(tokenize(query)):
                frequency = terms.count(term)
                if not frequency:
                    continue
                df = document_frequency.get(term, 0)
                idf = np.log(1 + (len(docs) - df + 0.5) / (df + 0.5))
                scores[i, j] += idf * frequency * 2.5 / (frequency + 1.5 * (0.25 + 0.75 * len(terms) / average_length))
    return scores

def retrieval_metrics(scores, query_roles, document_roles):
    totals = dict(mrrAt10=0., ndcgAt5=0., recallAt5=0., precisionAt5=0., top1Accuracy=0.)
    positive_scores, negative_scores = [], []
    for row, role in zip(scores, query_roles):
        order = np.argsort(-row, kind="stable")
        relevant = np.array([document_role == role for document_role in document_roles])
        ranked = relevant[order]
        matches = np.flatnonzero(ranked[:10])
        totals["mrrAt10"] += 1. / (matches[0] + 1) if len(matches) else 0.
        discount = 1. / np.log2(np.arange(5) + 2)
        dcg = np.dot(ranked[:5], discount[:len(ranked[:5])])
        ideal = discount[:min(5, int(relevant.sum()))].sum()
        totals["ndcgAt5"] += dcg / ideal if ideal else 0.
        totals["recallAt5"] += ranked[:5].sum() / relevant.sum()
        totals["precisionAt5"] += ranked[:5].sum() / min(5, len(ranked))
        totals["top1Accuracy"] += int(ranked[0])
        positive_scores.append(float(row[relevant].max()))
        negative_scores.append(float(row[~relevant].max()))
    count = max(1, len(scores))
    metrics = {key: round(float(value) / count, 6) for key, value in totals.items()}
    metrics["meanPositiveMinusHardNegative"] = round(float(np.mean(np.array(positive_scores) - np.array(negative_scores))), 6)
    return metrics

def evaluate_split(encoder, rows, lexical=False):
    documents = [row["text"] for row in rows]
    queries = [query for row in rows for query in row["queries"]]
    query_roles = [row["role"] for row in rows for _ in row["queries"]]
    document_roles = [row["role"] for row in rows]
    scores = lexical_scores(queries, documents) if lexical else encoder.encode(queries) @ encoder.encode(documents).T
    return retrieval_metrics(scores, query_roles, document_roles), scores
