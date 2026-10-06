"""Held-out evaluation after freezing checkpoint/threshold, cached to prevent tuning."""
import argparse
import json
import platform
import time
import numpy as np
from common import Encoder, MODEL_DIR, sha256_file, evaluate_split
from dataset import records, OUT_OF_SCOPE, dataset_hash, validate
from download import BASE_DIR

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    validate()
    metadata_path = MODEL_DIR / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert metadata["datasetSha256"] == dataset_hash()
    assert metadata["weightsSha256"] == sha256_file(MODEL_DIR / "model.safetensors")
    report_path = MODEL_DIR / "evaluation.json"
    if report_path.exists():
        saved = json.loads(report_path.read_text(encoding="utf-8"))
        if saved["weightsSha256"] != metadata["weightsSha256"]:
            raise RuntimeError("Held-out test already evaluated for another checkpoint")
        print(json.dumps(saved, ensure_ascii=False, indent=2))
        return
    base = Encoder(BASE_DIR, threads=args.threads)
    trained = Encoder(MODEL_DIR, threads=args.threads)
    test = records("test")
    lexical, _ = evaluate_split(None, test, lexical=True)
    base_metrics, _ = evaluate_split(base, test)
    fine_metrics, fine_scores = evaluate_split(trained, test)
    unknown_scores = trained.encode(OUT_OF_SCOPE["test"]) @ trained.encode([row["text"] for row in test]).T
    accepted_relevant = int((fine_scores.max(axis=1) >= metadata["threshold"]).sum())
    accepted_unknown = int((unknown_scores.max(axis=1) >= metadata["threshold"]).sum())
    # Warm single-query timing, held outside model-selection metrics.
    trained.encode([test[0]["queries"][0]])
    latencies = []
    for row in test:
        for query in row["queries"]:
            started = time.perf_counter(); trained.encode([query])
            latencies.append((time.perf_counter() - started) * 1000)
    report = {
        "modelVersion": metadata["modelVersion"], "weightsSha256": metadata["weightsSha256"],
        "datasetSha256": metadata["datasetSha256"], "protocol": "complete-held-out-task-families-with-seen-role-labels",
        "documents": len(test), "roleCount": 14, "positiveQueries": len(fine_scores), "unknownQueries": len(unknown_scores),
        "test": {"bm25": lexical, "baseEncoder": base_metrics, "fineTunedEncoder": fine_metrics},
        "abstention": {"thresholdChosenOnDev": metadata["threshold"], "relevantQueryAcceptance": accepted_relevant / len(fine_scores),
                       "outOfScopeFalseAcceptance": accepted_unknown / len(unknown_scores), "acceptedRelevant": accepted_relevant, "acceptedUnknown": accepted_unknown},
        "runtime": {"cpuThreads": args.threads, "cpu": platform.processor(), "weightBytes": (MODEL_DIR / "model.safetensors").stat().st_size,
                    "warmSingleQueryP50Ms": round(float(np.percentile(latencies, 50)), 3), "warmSingleQueryP95Ms": round(float(np.percentile(latencies, 95)), 3), "samples": len(latencies)},
        "limitations": metadata["limitations"] + ["One relevant document per query: the maximum Precision@5 is 0.2.", "Fourteen held-out documents is a small authored benchmark; no claim of real labor-market accuracy.", "Six unrelated test queries do not establish robust out-of-domain detection."],
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
