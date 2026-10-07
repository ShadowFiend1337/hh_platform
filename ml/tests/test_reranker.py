"""Inference safety and pair-score contract, using no network or model weights."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
import torch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reranker import Reranker, ROLE_LABELS, POLICY, MAX_LENGTH, BASE_MODEL, REVISION, FILES, KNOWN_HASHES, WEIGHTS_SHA256, document_context, validate_artifact, version_fingerprint
import evaluate

class Tokenizer:
    def __init__(self):
        self.calls = []
    def __call__(self, queries, texts, **options):
        self.calls.append((queries, texts, options))
        return dict(input_ids=torch.tensor([[len(t)] for t in texts]))

class Model:
    def __call__(self, input_ids):
        # Raw logits are intentionally outside [0,1].
        return SimpleNamespace(logits=input_ids.float() - 5.)

def fixture():
    scorer = Reranker.__new__(Reranker)
    scorer.tokenizer, scorer.model, scorer.batch_size = Tokenizer(), Model(), 2
    return scorer

class RerankerTests(unittest.TestCase):
    def test_encoder_evaluator_refuses_composite_before_loading_dataset(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            (path / "metadata.json").write_text(json.dumps(dict(reranker=dict(version="stage"))), encoding="utf-8")
            with patch.object(sys, "argv", ["evaluate.py", "--model", temporary]), patch.object(evaluate, "Encoder") as encoder:
                with self.assertRaisesRegex(RuntimeError, "encoder-evaluation.json"):
                    evaluate.main()
                encoder.assert_not_called()

    def test_pair_order_batching_raw_logits_and_fixed_window(self):
        scorer = fixture()
        output = scorer.score("query", ["a", "aaaaaa", "aa"])
        np.testing.assert_array_equal(output, [-4., 1., -3.])
        self.assertEqual(len(scorer.tokenizer.calls), 2)
        for queries, texts, options in scorer.tokenizer.calls:
            self.assertEqual(queries, ["query"] * len(texts))
            self.assertEqual(options["max_length"], MAX_LENGTH)
            self.assertTrue(options["truncation"])
        self.assertEqual(document_context("ML", "task"), ROLE_LABELS["ML"] + "\ntask")

    def test_invalid_inputs_never_reach_the_model(self):
        scorer = fixture()
        for query, texts in [(None, []), ("x" * 1201, []), ("x", [None]), ("x", ["x" * 12001]), ("x", ["x"] * 257)]:
            with self.assertRaises(ValueError):
                scorer.score(query, texts)
        self.assertEqual(scorer.tokenizer.calls, [])
        self.assertEqual(scorer.score("x", []).shape, (0,))

    def test_non_finite_model_output_is_rejected(self):
        scorer = fixture()
        scorer.model = lambda **kwargs: SimpleNamespace(logits=torch.tensor([[float("nan")]]))
        with self.assertRaises(ValueError):
            scorer.score("x", ["y"])

    def test_asset_policy_and_cutoff_fingerprint_and_path_guard(self):
        hashes = {name: KNOWN_HASHES.get(name, "a" * 64) for name in FILES}
        stage = dict(baseModel=BASE_MODEL, revision=REVISION, weightsSha256=WEIGHTS_SHA256, fileHashes=hashes,
                     policy=POLICY, maxLength=512, path="reranker", threshold=-1.3,
                     calibration=dict(datasetSha256="dataset"))
        stage["version"] = "mmarco-minilm-" + version_fingerprint(stage)[:12]
        def digest(path):
            return hashes[path.name]
        with patch("reranker.sha256_file", digest):
            self.assertEqual(validate_artifact(Path.cwd(), stage), Path.cwd() / "reranker")
        changed = copy.deepcopy(stage); changed["threshold"] += .1
        self.assertNotEqual(version_fingerprint(stage), version_fingerprint(changed))
        changed = copy.deepcopy(stage); changed["path"] = "../outside"
        with self.assertRaises(ValueError):
            validate_artifact(Path.cwd(), changed)
        changed = copy.deepcopy(stage); changed["revision"] = "main"
        with self.assertRaises(ValueError):
            validate_artifact(Path.cwd(), changed)

if __name__ == "__main__":
    unittest.main()
