"""One frozen held-out evaluation using the run's immutable dataset snapshot."""
import argparse
import json
import platform
import time
from pathlib import Path
import numpy as np
from common import Encoder, MODEL_DIR, ROOT, sha256_file, encoding_fingerprint, policy_from_metadata, evaluate_split, relevance_matrix, threshold_metrics
from dataset_v2 import records, dataset_hash, holdout_hash, validate
from download import BASE_DIR

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=ROOT / "server/data/semantic-runs/task-v2")
    parser.add_argument("--reference-model", type=Path)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    model_dir = args.model.resolve()
    metadata = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    value = json.loads((model_dir / metadata["datasetSnapshot"]).read_text(encoding="utf-8"))
    validate(value)
    assert metadata["datasetSha256"] == dataset_hash(value)
    assert metadata["holdoutSha256"] == holdout_hash(value)
    assert metadata["weightsSha256"] == sha256_file(model_dir / "model.safetensors")
    policy = policy_from_metadata(metadata)
    assert metadata["encodingFingerprint"] == encoding_fingerprint(metadata["weightsSha256"], policy)
    report_path = model_dir / "evaluation.json"
    if report_path.exists():
        saved = json.loads(report_path.read_text(encoding="utf-8"))
        if saved["encodingFingerprint"] != metadata["encodingFingerprint"] or saved["datasetSha256"] != metadata["datasetSha256"]:
            raise RuntimeError("Frozen evaluation belongs to another encoding or corpus")
        print(json.dumps(saved, ensure_ascii=False, indent=2))
        return
    ledger = ROOT / "server/data/semantic-evaluations" / (metadata["holdoutSha256"] + ".json")
    ledger.parent.mkdir(parents=True, exist_ok=True)
    identity = dict(modelVersion=metadata["modelVersion"], encodingFingerprint=metadata["encodingFingerprint"], run=str(model_dir), holdoutSha256=metadata["holdoutSha256"])
    try:
        with ledger.open("x", encoding="utf-8") as stream:
            json.dump(identity, stream, ensure_ascii=False, indent=2)
    except FileExistsError:
        previous = json.loads(ledger.read_text(encoding="utf-8"))
        if previous != identity:
            raise RuntimeError("This test has already been exposed by another experiment. Do not tune or re-evaluate a new model against the viewed holdout.")
    base = Encoder(BASE_DIR, threads=args.threads, policy=policy)
    trained = Encoder(model_dir, threads=args.threads)
    test = records("test", value)
    lexical, _ = evaluate_split(None, test, lexical=True)
    base_metrics, base_scores = evaluate_split(base, test)
    fine_metrics, fine_scores = evaluate_split(trained, test)
    relevance = relevance_matrix(test["queries"], test["documents"])
    positive_rows = relevance.any(axis=1)
    predicted = fine_scores >= metadata["threshold"]
    matched_positive = (predicted & relevance).any(axis=1)
    accepted_unknown = int(predicted[~positive_rows].any(axis=1).sum())
    accepted_relevant = int(matched_positive[positive_rows].sum())
    document_lookup = {d["id"]: d for d in test["documents"]}
    same_role_false = sum(bool(predicted[i, j]) and not bool(relevance[i, j]) and q["role"] == d["role"] for i, q in enumerate(test["queries"]) for j, d in enumerate(test["documents"]) if q["relevant"])
    # Timings do not feed selection. Short and long text timings are separate.
    measured = [q["text"] for q in test["queries"] if q["relevant"]]
    trained.encode([measured[0]])
    latencies = []
    for text in measured:
        started = time.perf_counter(); trained.encode([text]); latencies.append((time.perf_counter() - started) * 1000)
    long_text = " ".join(d["text"] for d in test["documents"][:12])[:7000]
    long_times = []
    for _ in range(8):
        started = time.perf_counter(); trained.encode([long_text]); long_times.append((time.perf_counter() - started) * 1000)
    report = {
        "modelVersion": metadata["modelVersion"], "weightsSha256": metadata["weightsSha256"], "encodingFingerprint": metadata["encodingFingerprint"], "encodingPolicy": policy,
        "datasetSha256": metadata["datasetSha256"], "holdoutSha256": metadata["holdoutSha256"], "protocol": metadata["protocol"],
        "documents": len(test["documents"]), "heldOutPositiveProfiles": sum(d["split"] == "test" for d in test["documents"]), "roleCount": len({d["role"] for d in test["documents"]}),
        "positiveQueries": int(positive_rows.sum()), "unknownQueries": int((~positive_rows).sum()), "relevantProfilesPerQuery": 2,
        "test": {"bm25": lexical, "baseEncoder": base_metrics, "fineTunedEncoder": fine_metrics},
        "pairRelevance": {"fineTunedEncoder": threshold_metrics(fine_scores, relevance, metadata["threshold"]), "baseEncoder": threshold_metrics(base_scores, relevance, metadata["baseThresholdSelection"]["threshold"]), "sameProfessionFalsePositivePairs": same_role_false},
        "abstention": {"thresholdChosenOnDevPairs": metadata["threshold"], "relevantQueryAcceptance": accepted_relevant / max(1, int(positive_rows.sum())), "outOfScopeFalseAcceptance": accepted_unknown / max(1, int((~positive_rows).sum())), "acceptedRelevant": accepted_relevant, "acceptedUnknown": accepted_unknown},
        "runtime": {"cpuThreads": args.threads, "cpu": platform.processor(), "weightBytes": (model_dir / "model.safetensors").stat().st_size, "warmSingleQueryP50Ms": round(float(np.percentile(latencies, 50)), 3), "warmSingleQueryP95Ms": round(float(np.percentile(latencies, 95)), 3), "samples": len(latencies), "longProfileCharacters": len(long_text), "longProfileP50Ms": round(float(np.percentile(long_times, 50)), 3), "longProfileP95Ms": round(float(np.percentile(long_times, 95)), 3), "longProfileSamples": len(long_times)},
        "limitations": metadata["limitations"] + ["Two relevant profiles per query: maximum Precision@5 is 0.4.", "A 168-document authored corpus does not measure real-world hiring accuracy.", "Functional regression cases are evaluated separately and never used for this threshold or checkpoint."],
    }
    if args.reference_model:
        reference_metadata = json.loads((args.reference_model / "metadata.json").read_text(encoding="utf-8"))
        assert reference_metadata["weightsSha256"] == sha256_file(args.reference_model / "model.safetensors")
        reference = Encoder(args.reference_model, threads=args.threads)
        metrics, scores = evaluate_split(reference, test)
        report["test"]["previousExperimentEncoder"] = metrics
        report["referenceModel"] = dict(modelVersion=reference_metadata["modelVersion"], weightsSha256=reference_metadata["weightsSha256"], encodingPolicy=reference.policy, threshold=reference_metadata["threshold"], pairRelevance=threshold_metrics(scores, relevance, reference_metadata["threshold"]))
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (model_dir / "runState.json").write_text(json.dumps(dict(state="evaluated-locked", **identity), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
