"""Protocol and artifact checks; does not re-run or tune the held-out benchmark."""
import json
import subprocess
import sys
import numpy as np
from common import MODEL_DIR, ROOT, DIMENSION
from dataset import records

def main():
    process = subprocess.Popen([sys.executable, "-X", "utf8", str(ROOT / "ml/worker.py"), "--model", str(MODEL_DIR)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
    try:
        def request(payload):
            process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n"); process.stdin.flush()
            response = json.loads(process.stdout.readline())
            assert response["id"] == payload["id"]
            return response
        health = request(dict(id="health", kind="health"))
        assert health["dimension"] == DIMENSION and health["trained"] is True
        texts = [records("train")[0]["queries"][0], records("train")[0]["text"]]
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
        final_health = request(dict(id="latency", kind="health"))
        assert final_health["latencySamples"] >= 3
        print(json.dumps(dict(passed=True, dimension=DIMENSION, modelVersion=health["modelVersion"], p95LatencyMs=final_health["p95LatencyMs"])))
    finally:
        process.stdin.close()
        process.wait(timeout=20)
        assert process.returncode == 0, process.stderr.read()

if __name__ == "__main__":
    main()
