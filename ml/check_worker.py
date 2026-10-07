"""Protocol and artifact checks; does not re-run or tune the held-out benchmark."""
import json
import argparse
from pathlib import Path
import subprocess
import sys
import numpy as np
from common import MODEL_DIR, ROOT, DIMENSION
from dataset import records

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_DIR)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    snapshot_path = args.model / "dataset.json"
    if snapshot_path.exists():
        data = json.loads(snapshot_path.read_text(encoding="utf-8"))
        query = next(q for q in data["queries"] if q["split"] == "train" and q["relevant"])
        profile = next(d for d in data["documents"] if d["id"] == query["relevant"][0])
        texts = [query["text"], profile["text"]]
    else:
        texts = [records("train")[0]["queries"][0], records("train")[0]["text"]]
    process = subprocess.Popen([sys.executable, "-X", "utf8", str(ROOT / "ml/worker.py"), "--model", str(args.model), "--threads", str(args.threads)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
    try:
        def request(payload):
            process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n"); process.stdin.flush()
            response = json.loads(process.stdout.readline())
            assert response["id"] == payload["id"]
            return response
        health = request(dict(id="health", kind="health"))
        assert health["dimension"] == DIMENSION and health["trained"] is True
        response = request(dict(id="encode", texts=texts))
        vectors = np.asarray(response["vectors"])
        assert vectors.shape == (2, DIMENSION)
        assert np.isfinite(vectors).all()
        assert np.allclose(np.linalg.norm(vectors, axis=1), 1., atol=1e-5)
        repeated = np.asarray(request(dict(id="again", texts=texts))["vectors"])
        assert np.allclose(vectors, repeated, atol=1e-7)
        assert request(dict(id="empty", texts=[]))["vectors"] == []
        assert request(dict(id="invalid", texts=[None]))["error"] == "invalid_request"
        assert request(dict(id="too-many", texts=["x"] * 257))["error"] == "invalid_request"
        assert request(dict(id="too-long", texts=["x"] * 1 + ["x" * 12001]))["error"] == "invalid_request"
        if health.get("encodingPolicy", {}).get("chunking"):
            long_text = " ".join([texts[1]] * 18)[:7000]
            long_vector = np.asarray(request(dict(id="long", texts=[long_text]))["vectors"])
            assert long_vector.shape == (1, DIMENSION) and np.isfinite(long_vector).all()
            assert np.allclose(np.linalg.norm(long_vector, axis=1), 1., atol=1e-5)
        if health.get("reranker"):
            from reranker import document_context
            passage = document_context(profile["role"], profile["text"]) if snapshot_path.exists() else texts[1]
            pair = dict(kind="rerank", query=texts[0], texts=[passage])
            scores = request(dict(id="rerank", **pair))["scores"]
            assert len(scores) == 1 and np.isfinite(scores).all()
            repeated_scores = request(dict(id="rerank-again", **pair))["scores"]
            assert np.allclose(scores, repeated_scores, atol=1e-7)
            assert request(dict(id="rerank-empty", kind="rerank", query=texts[0], texts=[]))["scores"] == []
            for identifier, query_text, candidates in [("bad-query", None, []), ("large-query", "x" * 1201, []),
                                                       ("many-rerank", "x", ["x"] * 257), ("long-rerank", "x", ["x" * 12001]),
                                                       ("invalid-rerank", "x", [None])]:
                assert request(dict(id=identifier, kind="rerank", query=query_text, texts=candidates))["error"] == "invalid_request"
        final_health = request(dict(id="latency", kind="health"))
        assert final_health["latencySamples"] >= 3
        print(json.dumps(dict(passed=True, dimension=DIMENSION, modelVersion=health["modelVersion"], p95LatencyMs=final_health["p95LatencyMs"],
                             rerankerVersion=health.get("reranker", {}).get("version"), rerankerP95LatencyMs=final_health.get("rerankerP95LatencyMs"))))
    finally:
        process.stdin.close()
        process.wait(timeout=20)
        assert process.returncode == 0, process.stderr.read()

if __name__ == "__main__":
    main()
