"""Full-encoder task adaptation; model selection sees only independent dev."""
import argparse
import json
import math
import platform
import random
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import torch
import transformers
from common import Encoder, ROOT, TASK_POLICY, DIMENSION, sha256_file, encoding_fingerprint, evaluate_split, relevance_matrix, threshold_from_scores
from dataset_v2 import snapshot as snapshot_v2, records, dataset_hash, holdout_hash
from dataset_v3 import snapshot as snapshot_v3
from download import download, BASE_MODEL, BASE_REVISION

DEFAULT_OUTPUT = ROOT / "server/data/semantic-runs/task-v2"

def mine_triplets(encoder, data, seed):
    documents = data["documents"]
    positive_queries = [q for q in data["queries"] if q["relevant"]]
    unrelated = [q for q in data["queries"] if not q["relevant"]]
    scores = encoder.encode([q["text"] for q in positive_queries]) @ encoder.encode([d["text"] for d in documents]).T
    result = []
    rng = random.Random(seed)
    for query, row in zip(positive_queries, scores):
        order = np.argsort(-row, kind="stable")
        positive = set(query["relevant"])
        same_role = [documents[int(i)] for i in order if documents[int(i)]["id"] not in positive and documents[int(i)]["role"] == query["role"]]
        cross_role = [documents[int(i)] for i in order if documents[int(i)]["role"] != query["role"]]
        assert same_role and cross_role and unrelated
        negatives = [(same_role[0]["id"], "same-role-hard"), (cross_role[0]["id"], "cross-role-hard"), (rng.choice(unrelated)["id"], "unrelated")]
        for positive_id in query["relevant"]:
            for negative_id, kind in negatives:
                assert negative_id not in positive
                result.append((query["id"], positive_id, negative_id, kind))
    return result

def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def teacher_targets(encoder, data):
    """Base targets contain TRAIN documents/queries only, including OOS train."""
    rows = data["documents"] + data["queries"]
    assert all(row["split"] == "train" for row in rows)
    by_id = {row["id"]: row["text"] for row in rows}
    identifiers = sorted(by_id)
    vectors = encoder.encode([by_id[identifier] for identifier in identifiers])
    return identifiers, vectors

def preservation_loss(vectors, targets):
    return (1. - torch.nn.functional.cosine_similarity(vectors, targets, dim=1)).mean()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--dataset", choices=["v2", "v3"], default="v2")
    parser.add_argument("--epochs", type=int)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--seed", type=int, default=20261006)
    parser.add_argument("--learning-rate", type=float)
    parser.add_argument("--teacher-regularization", type=float)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    # V3 settings are fixed before seeing its dev scores; overrides are recorded.
    if args.epochs is None:
        args.epochs = 6 if args.dataset == "v3" else 12
    if args.learning_rate is None:
        args.learning_rate = 5e-6 if args.dataset == "v3" else 2e-5
    if args.teacher_regularization is None:
        args.teacher_regularization = 10. if args.dataset == "v3" else 0.
    if args.output is None:
        args.output = ROOT / f"server/data/semantic-runs/task-{args.dataset}"
    if not (1 <= args.epochs <= 100 and 1 <= args.batch_size <= 64 and 1 <= args.threads <= 64 and 0 < args.learning_rate < .01
            and math.isfinite(args.teacher_regularization) and 0 <= args.teacher_regularization <= 1000):
        parser.error("Invalid training parameter")
    output = args.output.resolve()
    protected = ("evaluation.json", "metadata.json", "model.safetensors", "dataset.json", "runState.json")
    if any((output / name).exists() for name in protected):
        raise RuntimeError("This experiment already exists. Keep its artifacts and evaluated test intact; use a new run with a new independent holdout for further tuning.")
    value = snapshot_v3() if args.dataset == "v3" else snapshot_v2()
    viewed = ROOT / "server/data/semantic-evaluations" / (holdout_hash(value) + ".json")
    if viewed.exists():
        raise RuntimeError("This holdout has already been evaluated. Use a genuinely new held-out task corpus, not another output directory or renamed record IDs.")
    train, dev = records("train", value), records("dev", value)
    output.mkdir(parents=True, exist_ok=True)
    save_json(output / "dataset.json", value)
    plan = dict(dataset=args.dataset, epochs=args.epochs, learningRate=args.learning_rate, teacherRegularization=args.teacher_regularization,
                batchSize=args.batch_size, cpuThreads=args.threads, seed=args.seed,
                checkpointSelection="dev-ndcgAt5-then-mrrAt10-then-gap", thresholdSelection="dev-pair-F1-then-precision-then-recall")
    save_json(output / "experiment-plan.json", plan)
    save_json(output / "runState.json", dict(state="training", datasetSha256=dataset_hash(value), **plan))
    source = output / "source"
    source.mkdir()
    sources = ["common.py", "dataset.py", "dataset_v2.py", "dataset_v3.py", "train.py", "evaluate.py", "worker.py", "download.py", "requirements.txt"]
    source_hashes = {}
    for name in sources:
        origin = ROOT / "ml" / name
        shutil.copy2(origin, source / name)
        source_hashes[name] = sha256_file(origin)
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    base_dir = download()
    encoder = Encoder(base_dir, threads=args.threads, policy=TASK_POLICY)
    base_dev, base_scores = evaluate_split(encoder, dev)
    base_threshold = threshold_from_scores(base_scores, relevance_matrix(dev["queries"], dev["documents"]))
    print(json.dumps({"phase": "base-dev", "metrics": base_dev, "threshold": base_threshold, "output": str(output)}), flush=True)
    text_by_id = {row["id"]: row["text"] for row in train["documents"] + train["queries"]}
    teacher_lookup, teacher_metadata = None, dict(weight=args.teacher_regularization, enabled=False)
    if args.teacher_regularization:
        identifiers, targets = teacher_targets(encoder, train)
        cache = output / "teacher-train-embeddings.npz"
        np.savez_compressed(cache, ids=np.asarray(identifiers, dtype=np.str_), vectors=targets)
        teacher_lookup = {identifier: torch.from_numpy(targets[index]) for index, identifier in enumerate(identifiers)}
        teacher_weights = sha256_file(base_dir / "model.safetensors")
        teacher_metadata = dict(weight=args.teacher_regularization, enabled=True, loss="mean-1-minus-cosine-on-anchor-positive-negative",
                                sourceModel=BASE_MODEL, sourceWeightsSha256=teacher_weights, encodingPolicy=TASK_POLICY,
                                encodingFingerprint=encoding_fingerprint(teacher_weights, TASK_POLICY), cache=cache.name,
                                cacheSha256=sha256_file(cache), records=len(identifiers), containsSplits=["train"])
        print(json.dumps({"phase": "teacher-cached", "records": len(identifiers), "weight": args.teacher_regularization}), flush=True)
    first_triplets = mine_triplets(encoder, train, args.seed + 1)
    total_steps = args.epochs * math.ceil(len(first_triplets) / args.batch_size)
    optimizer = torch.optim.AdamW(encoder.model.parameters(), lr=args.learning_rate, weight_decay=.01)
    best, epochs = None, []
    started = time.perf_counter()
    step = 0
    warmup = max(1, int(total_steps * .1))
    for epoch in range(1, args.epochs + 1):
        triples = first_triplets if epoch == 1 else mine_triplets(encoder, train, args.seed + epoch)
        save_json(output / f"mining-epoch-{epoch:02d}.json", [dict(query=q, positive=p, negative=n, kind=k) for q, p, n, k in triples])
        order = list(triples); random.shuffle(order)
        encoder.model.train()
        losses, task_losses, teacher_losses = [], [], []
        for offset in range(0, len(order), args.batch_size):
            batch = order[offset:offset + args.batch_size]
            anchors = [text_by_id[q] for q, _, _, _ in batch]
            positives = [text_by_id[p] for _, p, _, _ in batch]
            negatives = [text_by_id[n] for _, _, n, _ in batch]
            vectors = encoder.forward(anchors + positives + negatives)
            anchor, positive, negative = vectors.chunk(3)
            positive_similarity = (anchor * positive).sum(dim=1)
            negative_similarity = (anchor * negative).sum(dim=1)
            task_loss = torch.nn.functional.softplus((negative_similarity - positive_similarity + .15) * 10).mean()
            teacher_loss = vectors.new_zeros(())
            if teacher_lookup is not None:
                identifiers = [q for q, _, _, _ in batch] + [p for _, p, _, _ in batch] + [n for _, _, n, _ in batch]
                targets = torch.stack([teacher_lookup[identifier] for identifier in identifiers]).to(device=vectors.device, dtype=vectors.dtype)
                teacher_loss = preservation_loss(vectors, targets)
            loss = task_loss + args.teacher_regularization * teacher_loss
            multiplier = (step + 1) / warmup if step < warmup else max(.1, (total_steps - step) / max(1, total_steps - warmup))
            for group in optimizer.param_groups:
                group["lr"] = args.learning_rate * multiplier
            optimizer.zero_grad(set_to_none=True); loss.backward()
            torch.nn.utils.clip_grad_norm_(encoder.model.parameters(), 1.)
            optimizer.step()
            losses.append(float(loss.detach())); task_losses.append(float(task_loss.detach())); teacher_losses.append(float(teacher_loss.detach())); step += 1
            if step % 12 == 0:
                print(json.dumps({"phase": "training", "epoch": epoch, "step": step, "totalSteps": total_steps, "loss": round(float(np.mean(losses)), 6), "elapsedSeconds": round(time.perf_counter() - started, 2)}), flush=True)
        metrics, _ = evaluate_split(encoder, dev)
        item = dict(epoch=epoch, loss=round(float(np.mean(losses)), 6), taskLoss=round(float(np.mean(task_losses)), 6), teacherPreservationLoss=round(float(np.mean(teacher_losses)), 6), dev=metrics, triplets=len(triples), negatives={kind: sum(t[3] == kind for t in triples) for kind in ("same-role-hard", "cross-role-hard", "unrelated")})
        epochs.append(item)
        key = (metrics["ndcgAt5"], metrics["mrrAt10"], metrics["meanPositiveMinusHardNegative"])
        if best is None or key > best[0]:
            best = (key, epoch)
            encoder.save(output)
        save_json(output / "training-progress.json", dict(epochs=epochs, selectedEpoch=best[1], optimizerSteps=step))
        print(json.dumps({"phase": "epoch-complete", **item, "selectedEpoch": best[1]}), flush=True)
    selected = Encoder(output, threads=args.threads, policy=TASK_POLICY)
    _, selected_scores = evaluate_split(selected, dev)
    chosen_threshold = threshold_from_scores(selected_scores, relevance_matrix(dev["queries"], dev["documents"]))
    weights_hash = sha256_file(output / "model.safetensors")
    fingerprint = encoding_fingerprint(weights_hash, TASK_POLICY)
    metadata = {
        "schemaVersion": 2, "trained": True, "baseModel": BASE_MODEL, "baseRevision": BASE_REVISION,
        "license": "MIT", "modelCard": "https://huggingface.co/cointegrated/rubert-tiny2",
        "trainingKind": "full-encoder-task-qrels-base-regularized-fine-tuning" if args.teacher_regularization else "full-encoder-task-qrels-fine-tuning", "trainableParameters": sum(p.numel() for p in encoder.model.parameters()),
        "teacherRegularization": teacher_metadata,
        "experimentPlan": plan,
        "dimension": DIMENSION, "maxSequenceLength": TASK_POLICY["maxLength"], "pooling": "normalized-CLS-chunk-mean-L2",
        "encodingPolicy": TASK_POLICY, "encodingFingerprint": fingerprint,
        "datasetSha256": dataset_hash(value), "holdoutSha256": holdout_hash(value), "datasetName": value["name"], "datasetSnapshot": "dataset.json", "sourceHashes": source_hashes,
        "seed": args.seed, "selectedEpoch": best[1], "epochs": args.epochs, "batchSize": args.batch_size,
        "learningRate": args.learning_rate, "learningRateSchedule": "10-percent-warmup-linear-decay-floor-0.1",
        "optimizer": "AdamW", "weightDecay": .01, "tripletMargin": .15, "tripletsPerEpoch": len(first_triplets), "optimizerSteps": step,
        "negativeMining": "epoch-refreshed-train-only-same-role-hard-cross-role-hard-unrelated",
        "cpuThreadsTraining": args.threads, "trainingSeconds": round(time.perf_counter() - started, 3),
        "versions": {"python": platform.python_version(), "torch": torch.__version__, "transformers": transformers.__version__},
        "baseWeightsSha256": sha256_file(base_dir / "model.safetensors"), "weightsSha256": weights_hash,
        "threshold": chosen_threshold["threshold"], "thresholdSelection": chosen_threshold, "baseThresholdSelection": base_threshold,
        "validation": {"base": base_dev, "epochs": epochs},
        "splits": {part: {"families": sum(f["split"] == part for f in value["splitManifest"]), "positiveProfiles": sum(d["split"] == part for d in value["documents"]), "corpusDocuments": len(records(part, value)["documents"]), "positiveQueries": sum(q["split"] == part and bool(q["relevant"]) for q in value["queries"]), "unrelatedQueries": sum(q["split"] == part and not q["relevant"] for q in value["queries"])} for part in ("train", "dev", "test")},
        "protocol": "task-family-heldout-explicit-document-qrels-with-seen-task-distractors",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "limitations": value["limitations"] + ["All 14 professions are seen in training; dev and test hold out whole task families.", "Test corpus includes seen task descriptions as distractors, never as additional positives by profession.", "Cosine similarity is not a hiring probability or evidence of competence.", "Unrelated controls are small and cannot establish universal out-of-domain detection."],
    }
    metadata["modelVersion"] = "rubert-tiny2-task-" + args.dataset + "-" + fingerprint[:12]
    save_json(output / "metadata.json", metadata)
    save_json(output / "runState.json", dict(state="frozen-awaiting-evaluation", modelVersion=metadata["modelVersion"], datasetSha256=metadata["datasetSha256"], weightsSha256=weights_hash))
    print(json.dumps({"phase": "ready", "modelVersion": metadata["modelVersion"], "selectedEpoch": best[1], "threshold": metadata["threshold"], "seconds": metadata["trainingSeconds"], "output": str(output)}), flush=True)

if __name__ == "__main__":
    main()
