"""Protocol correctness tests. They do not train or score the held-out model."""
import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import torch
from common import Encoder, LEGACY_POLICY, TASK_POLICY, policy_from_metadata, encoding_fingerprint, relevance_matrix, retrieval_metrics, threshold_from_scores, threshold_metrics
from dataset_v2 import snapshot, records, holdout_hash, validate
from dataset_v3 import snapshot as snapshot_v3, validate as validate_v3
from train import mine_triplets, teacher_targets, preservation_loss

class FakeTokenizer:
    def __call__(self, texts, **options):
        return {"input_ids": torch.tensor([[0], [1], [2]]), "attention_mask": torch.ones((3, 1), dtype=torch.long), "overflow_to_sample_mapping": torch.tensor([0, 0, 1])}

class FakeModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.weight = torch.nn.Parameter(torch.tensor([[1., 0., .2], [0., 1., .2], [1., 1., .1]]))
    def forward(self, input_ids, attention_mask):
        return SimpleNamespace(last_hidden_state=self.weight[input_ids])

class FakeEncoder:
    def encode(self, texts):
        return np.asarray([[len(t), sum(map(ord, t)) % 127, 1.] for t in texts], dtype=float)

class PipelineTests(unittest.TestCase):
    def test_task_qrels_and_full_family_partition(self):
        value = snapshot()
        self.assertEqual(len(value["splitManifest"]), 84)
        self.assertEqual(len(value["documents"]), 168)
        self.assertEqual(len(value["queries"]), 276)
        self.assertEqual(len(records("dev", value)["documents"]), 140)
        self.assertFalse(any(d["split"] == "test" for d in records("dev", value)["documents"]))
        for part in ("train", "dev", "test"):
            for query in records(part, value)["queries"]:
                self.assertEqual(len(query["relevant"]), 2 if query["role"] else 0)
        invalid = copy.deepcopy(value)
        invalid["queries"][0]["split"] = "test"
        with self.assertRaises(AssertionError):
            validate(invalid)

    def test_qrels_not_profession_define_relevance(self):
        queries = [dict(relevant=["good"])]
        documents = [dict(id="wrong", role="ML"), dict(id="good", role="ML")]
        truth = relevance_matrix(queries, documents)
        np.testing.assert_array_equal(truth, [[False, True]])
        result = retrieval_metrics(np.asarray([[.9, .8]]), truth)
        self.assertEqual(result["top1Accuracy"], 0)
        self.assertEqual(result["mrrAt10"], .5)

    def test_pair_threshold_penalizes_wrong_documents(self):
        scores = np.asarray([[.9, .8, .1], [.15, .14, .13]])
        truth = np.asarray([[True, False, False], [False, False, False]])
        selected = threshold_from_scores(scores, truth)
        self.assertGreater(selected["threshold"], .8)
        self.assertEqual(selected["f1"], 1)
        self.assertEqual(threshold_metrics(scores, truth, .1)["falsePositive"], 5)

    def test_policy_fingerprint_and_legacy_window(self):
        legacy = policy_from_metadata(dict(maxSequenceLength=192))
        self.assertEqual(legacy, LEGACY_POLICY)
        self.assertNotEqual(encoding_fingerprint("weights", legacy), encoding_fingerprint("weights", TASK_POLICY))
        self.assertEqual(policy_from_metadata(dict(encodingPolicy=TASK_POLICY)), TASK_POLICY)

    def test_long_text_chunk_mean_is_normalized_and_differentiable(self):
        encoder = Encoder.__new__(Encoder)
        encoder.policy, encoder.tokenizer, encoder.model = TASK_POLICY, FakeTokenizer(), FakeModel()
        output = encoder.forward(["long", "short"])
        normalized = torch.nn.functional.normalize(encoder.model.weight, dim=1)
        expected = torch.stack([torch.nn.functional.normalize(normalized[:2].mean(dim=0), dim=0), normalized[2]])
        torch.testing.assert_close(output, expected)
        output[:, 0].sum().backward()
        self.assertIsNotNone(encoder.model.weight.grad)
        self.assertTrue(torch.isfinite(encoder.model.weight.grad).all())

    def test_mining_uses_train_only_and_excludes_all_positives(self):
        data = records("train")
        triples = mine_triplets(FakeEncoder(), data, 1)
        self.assertEqual(len(triples), 1008)
        self.assertEqual({t[3] for t in triples}, {"same-role-hard", "cross-role-hard", "unrelated"})
        queries = {q["id"]: q for q in data["queries"]}
        docs = {d["id"]: d for d in data["documents"]}
        for q, p, n, kind in triples:
            self.assertIn(p, queries[q]["relevant"])
            self.assertNotIn(n, queries[q]["relevant"])
            self.assertEqual(queries[q]["split"], "train")
            if kind == "same-role-hard":
                self.assertEqual(docs[n]["role"], queries[q]["role"])
            if kind == "cross-role-hard":
                self.assertNotEqual(docs[n]["role"], queries[q]["role"])
            if kind == "unrelated":
                self.assertEqual(queries[n]["relevant"], [])

    def test_renaming_ids_does_not_reset_viewed_holdout(self):
        original = snapshot()
        changed = copy.deepcopy(original)
        for doc in changed["documents"]:
            doc["id"] += "-renamed"
        for query in changed["queries"]:
            query["id"] += "-renamed"
            query["relevant"] = [identifier + "-renamed" for identifier in query["relevant"]]
        self.assertEqual(holdout_hash(original), holdout_hash(changed))

    def test_v3_reuses_only_train_families_and_has_new_holdout(self):
        old, new = snapshot(), snapshot_v3()
        self.assertEqual(len(new["splitManifest"]), 84)
        self.assertEqual(len(new["documents"]), 168)
        self.assertEqual(len(new["queries"]), 276)
        old_train = [x for x in old["documents"] + old["queries"] if x["split"] == "train" and x["role"]]
        new_train = [x for x in new["documents"] + new["queries"] if x["split"] == "train" and x["role"]]
        self.assertEqual(old_train, new_train)
        self.assertNotEqual(holdout_hash(old), holdout_hash(new))
        invalid = copy.deepcopy(new)
        heldout = next(x for x in old["documents"] if x["split"] == "test")
        invalid["documents"][-1]["text"] = heldout["text"]
        with self.assertRaises(AssertionError):
            validate_v3(invalid)

    def test_teacher_cache_cannot_include_dev_or_test(self):
        train = records("train", snapshot_v3())
        identifiers, vectors = teacher_targets(FakeEncoder(), train)
        self.assertEqual(len(identifiers), 288)
        self.assertEqual(set(identifiers), {x["id"] for x in train["documents"] + train["queries"]})
        self.assertEqual(vectors.shape, (288, 3))
        invalid = copy.deepcopy(train)
        invalid["queries"][0]["split"] = "dev"
        with self.assertRaises(AssertionError):
            teacher_targets(FakeEncoder(), invalid)

    def test_teacher_preservation_penalty_has_a_real_gradient(self):
        target = torch.tensor([[1., 0.], [0., 1.]])
        self.assertAlmostEqual(float(preservation_loss(target, target)), 0.)
        moved = torch.tensor([[.8, .6], [.6, .8]], requires_grad=True)
        penalty = preservation_loss(moved, target)
        self.assertGreater(float(penalty.detach()), 0.)
        penalty.backward()
        self.assertTrue(torch.isfinite(moved.grad).all())
        self.assertGreater(float(moved.grad.abs().sum()), 0.)

if __name__ == "__main__":
    unittest.main()
