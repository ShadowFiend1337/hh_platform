"""CPU full-encoder task adaptation. Model selection sees dev, never test."""
import argparse
import json
import platform
import random
import time
from datetime import datetime, timezone
import numpy as np
import torch
import transformers
from common import Encoder, MODEL_DIR, MAX_LENGTH, DIMENSION, sha256_file, evaluate_split
from dataset import records, dataset_hash, OUT_OF_SCOPE, validate
from download import download, BASE_MODEL, BASE_REVISION

def threshold_from_dev(encoder, rows):
    documents = encoder.encode([row["text"] for row in rows])
    positive_queries = [query for row in rows for query in row["queries"]]
    negative_queries = OUT_OF_SCOPE["dev"]
    scores = encoder.encode(positive_queries + negative_queries) @ documents.T
    top_scores = scores.max(axis=1)
    truth = np.array([True] * len(positive_queries) + [False] * len(negative_queries))
    boundaries = sorted(set(float(value) for value in top_scores))
    cutoffs = [boundaries[0] - 1e-6, boundaries[-1] + 1e-6]
    cutoffs += [(a + b) / 2 for a, b in zip(boundaries, boundaries[1:])]
    choices = []
    for cutoff in cutoffs:
        predicted = top_scores >= cutoff
        tp = int((predicted & truth).sum()); fp = int((predicted & ~truth).sum())
        fn = int((~predicted & truth).sum()); tn = int((~predicted & ~truth).sum())
        balanced_accuracy = .5 * (tp / (tp + fn) + tn / (tn + fp))
        f1 = 2 * tp / max(1, 2 * tp + fp + fn)
        choices.append(((balanced_accuracy, f1, cutoff), dict(threshold=cutoff, balancedAccuracy=balanced_accuracy, f1=f1, truePositive=tp, falsePositive=fp, falseNegative=fn, trueNegative=tn)))
    return max(choices, key=lambda value: value[0])[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--seed", type=int, default=20261006)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    if (MODEL_DIR / "evaluation.json").exists():
        raise RuntimeError("A locked held-out evaluation already exists. Do not tune on this test; author a new independent holdout for a new experiment.")
    validate()
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    base_dir = download()
    encoder = Encoder(base_dir, threads=args.threads)
    train, dev = records("train"), records("dev")
    base_dev, _ = evaluate_split(encoder, dev)
    print(json.dumps({"phase": "base-dev", "metrics": base_dev}), flush=True)
    docs = [row["text"] for row in train]
    queries = [query for row in train for query in row["queries"]]
    roles = [row["role"] for row in train for _ in row["queries"]]
    # Mining uses only training profiles. Same-role profiles remain positive,
    # so another qualified professional is never a false in-batch negative.
    similarities = encoder.encode(queries) @ encoder.encode(docs).T
    triplets = []
    for query, role, scores in zip(queries, roles, similarities):
        positive_ids = [i for i, row in enumerate(train) if row["role"] == role]
        negative_ids = [int(i) for i in np.argsort(-scores) if train[int(i)]["role"] != role][:4]
        for positive_id in positive_ids:
            for negative_id in negative_ids[:2]:
                triplets.append((query, docs[positive_id], docs[negative_id]))
    optimizer = torch.optim.AdamW(encoder.model.parameters(), lr=args.learning_rate, weight_decay=.01)
    best, epochs = None, []
    started = time.perf_counter()
    total_steps = args.epochs * int(np.ceil(len(triplets) / args.batch_size))
    step = 0
    for epoch in range(1, args.epochs + 1):
        order = list(triplets); random.shuffle(order)
        encoder.model.train()
        losses = []
        for offset in range(0, len(order), args.batch_size):
            batch = order[offset:offset + args.batch_size]
            anchors, positives, negatives = zip(*batch)
            vectors = encoder.forward([*anchors, *positives, *negatives])
            anchor, positive, negative = vectors.chunk(3)
            positive_similarity = (anchor * positive).sum(dim=1)
            negative_similarity = (anchor * negative).sum(dim=1)
            loss = torch.nn.functional.softplus((negative_similarity - positive_similarity + .15) * 10).mean()
            optimizer.zero_grad(set_to_none=True); loss.backward()
            torch.nn.utils.clip_grad_norm_(encoder.model.parameters(), 1.)
            optimizer.step()
            losses.append(float(loss.detach())); step += 1
            if step % 12 == 0:
                print(json.dumps({"phase": "training", "epoch": epoch, "step": step, "totalSteps": total_steps, "loss": round(float(np.mean(losses)), 6), "elapsedSeconds": round(time.perf_counter() - started, 2)}), flush=True)
        metrics, _ = evaluate_split(encoder, dev)
        item = dict(epoch=epoch, loss=round(float(np.mean(losses)), 6), dev=metrics)
        epochs.append(item)
        key = (metrics["mrrAt10"], metrics["ndcgAt5"], metrics["meanPositiveMinusHardNegative"])
        if best is None or key > best[0]:
            best = (key, epoch)
            encoder.save(MODEL_DIR)
        print(json.dumps({"phase": "epoch-complete", **item, "selectedEpoch": best[1]}), flush=True)
    selected = Encoder(MODEL_DIR, threads=args.threads)
    threshold = threshold_from_dev(selected, dev)
    metadata = {
        "schemaVersion": 1, "trained": True, "baseModel": BASE_MODEL, "baseRevision": BASE_REVISION,
        "license": "MIT", "modelCard": "https://huggingface.co/cointegrated/rubert-tiny2",
        "trainingKind": "full-encoder-fine-tuning", "trainableParameters": sum(p.numel() for p in encoder.model.parameters()),
        "dimension": DIMENSION, "maxSequenceLength": MAX_LENGTH, "pooling": "CLS-L2",
        "datasetSha256": dataset_hash(), "seed": args.seed, "selectedEpoch": best[1],
        "epochs": args.epochs, "batchSize": args.batch_size, "learningRate": args.learning_rate,
        "optimizer": "AdamW", "weightDecay": .01, "tripletMargin": .15, "triplets": len(triplets),
        "cpuThreadsTraining": args.threads, "trainingSeconds": round(time.perf_counter() - started, 3),
        "versions": {"python": platform.python_version(), "torch": torch.__version__, "transformers": transformers.__version__},
        "baseWeightsSha256": sha256_file(base_dir / "model.safetensors"),
        "weightsSha256": sha256_file(MODEL_DIR / "model.safetensors"),
        "threshold": threshold["threshold"], "thresholdSelection": threshold,
        "validation": {"base": base_dev, "epochs": epochs},
        "splits": {split: {"families": len(records(split)), "queries": sum(len(row["queries"]) for row in records(split))} for split in ["train", "dev", "test"]},
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "limitations": ["Authored synthetic task-to-role relevance labels; not human recruitment validation.", "All 14 role labels occur in training; only task families and texts are held out.", "Scores are cosine similarities, not probabilities or verified competence."],
    }
    metadata["modelVersion"] = "rubert-tiny2-recruitment-" + metadata["weightsSha256"][:12]
    (MODEL_DIR / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"phase": "ready", "modelVersion": metadata["modelVersion"], "selectedEpoch": best[1], "threshold": metadata["threshold"], "seconds": metadata["trainingSeconds"]}), flush=True)
    # No held-out test computation occurs until the checkpoint and threshold
    # above have been persisted. Evaluate CLI refuses accidental re-evaluation.

if __name__ == "__main__":
    main()
