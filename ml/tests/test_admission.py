"""Applicability-floor tests without models, network or held-out data."""
import copy
import tempfile
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import canonical_hash, relevance_matrix, retrieval_metrics, threshold_from_scores, sha256_file
from prepare_admission import select_with_fallback, calibrate_admission, load_features
from reranker import ADMISSION_KIND, validate_admission

class AdmissionTests(unittest.TestCase):
    def test_fallback_only_when_strong_empty_and_never_more_than_three(self):
        scores = np.asarray([[9., 8., 2., 1.], [5., 4., 3., 2.], [1., .5, 0., -.5], [4., 4., 4., 4.]])
        strong, fallback = select_with_fallback(scores, 8., 2.5)
        np.testing.assert_array_equal(strong[0], [True, True, False, False])
        self.assertFalse(fallback[0].any())
        np.testing.assert_array_equal(fallback[1], [True, True, True, False])
        self.assertFalse(fallback[2].any())
        # Ties use stable corpus order and retain the same bound.
        np.testing.assert_array_equal(fallback[3], [True, True, True, False])
        with self.assertRaises(ValueError):
            select_with_fallback(scores, 8., 2.5, limit=4)

    def test_query_calibration_reports_both_strict_and_bounded_fallback(self):
        scores = np.asarray([[9., 8., 2., 1.], [5., 4., 3., 2.], [1., .5, 0., -.5]])
        truth = np.asarray([[True, False, False, False], [True, False, False, False], [False] * 4])
        cutoff, metrics = calibrate_admission(scores, truth, 8.)
        self.assertEqual(cutoff, 3.)
        self.assertEqual(metrics["strict"]["positiveQueriesWithAcceptedRelevant"], 1)
        self.assertEqual(metrics["withFallback"]["positiveQueriesWithAcceptedRelevant"], 2)
        self.assertEqual(metrics["withFallback"]["OOSAcceptance"], 0)
        self.assertEqual(metrics["fallbackOnly"]["triggeredQueries"], 1)
        self.assertEqual(metrics["fallbackOnly"]["selection"]["acceptedPairs"], 3)
        self.assertAlmostEqual(metrics["fallbackOnly"]["selection"]["pairMetrics"]["precision"], 1 / 3)
        self.assertTrue(metrics["resubstitution"])
        self.assertFalse(metrics["heldOutScored"])

    def test_admission_policy_hash_bindings_and_unchanged_pair_calibration(self):
        calibration = dict(threshold=8., weights=[2., 3.], bias=1.,
                           hashes={key: str(index) * 64 for index, key in enumerate(["datasetSha256", "encodingFingerprint", "devRecordsSha256", "denseScoresSha256", "crossScoresSha256"])})
        hashes = {**calibration["hashes"], "sourceMetadataSha256": "5" * 64, "featureCacheSha256": "6" * 64,
                  "sourceCalibrationSha256": canonical_hash(calibration), "calibrationSourceSha256": "7" * 64}
        admission = dict(kind=ADMISSION_KIND, threshold=3., limit=3, split="dev", hashes=hashes,
                         metrics=dict(resubstitution=True, heldOutScored=False, functionalBenchmarkScored=False))
        self.assertEqual(validate_admission(admission, calibration), admission)
        with_admission = copy.deepcopy(calibration); with_admission["admission"] = admission
        self.assertEqual(validate_admission(admission, with_admission), admission)
        for key, bad in [("threshold", float("nan")), ("threshold", True), ("threshold", 8.), ("limit", 4), ("split", "test")]:
            changed = copy.deepcopy(admission); changed[key] = bad
            with self.assertRaises(ValueError):
                validate_admission(changed, calibration)
        changed = copy.deepcopy(admission); changed["hashes"]["denseScoresSha256"] = "8" * 64
        with self.assertRaises(ValueError):
            validate_admission(changed, calibration)
        changed_calibration = copy.deepcopy(calibration); changed_calibration["weights"][0] += .1
        with self.assertRaises(ValueError):
            validate_admission(admission, changed_calibration)

    def test_frozen_features_validate_ids_and_dense_hash_without_encoding(self):
        dev = dict(documents=[dict(id="p", split="dev"), dict(id="n", split="train")],
                   queries=[dict(id="q", split="dev", relevant=["p"]), dict(id="oos", split="dev", relevant=[])])
        cross = np.asarray([[3., -2.], [-4., -4.]], dtype=np.float32)
        dense = np.asarray([[.8, .1], [.1, .2]], dtype=np.float32)
        truth = relevance_matrix(dev["queries"], dev["documents"])
        report = dict(split="dev", heldOutScored=False, documentPairs=4, thresholdSelection=threshold_from_scores(cross, truth), ranking=retrieval_metrics(cross, truth))
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            np.savez_compressed(path / "reranker-dev-scores.npz", scores=cross, queryIds=np.asarray(["q", "oos"]), documentIds=np.asarray(["p", "n"]))
            cache_path = path / "fusion-dev-features.npz"
            np.savez_compressed(cache_path, encoderCosine=dense, crossEncoderRawLogit=cross, queryIds=np.asarray(["q", "oos"]), documentIds=np.asarray(["p", "n"]))
            metadata = dict(reranker=dict(calibration=report, scoreCalibration=dict(hashes=dict(devRecordsSha256=canonical_hash(dev),
                            crossScoresSha256=sha256_file(path / "reranker-dev-scores.npz"), denseScoresSha256=canonical_hash(dense.tolist())))))
            actual_dense, actual_cross, digest = load_features(path, metadata, dev)
            np.testing.assert_array_equal(actual_dense, dense)
            np.testing.assert_array_equal(actual_cross, cross)
            self.assertEqual(digest, sha256_file(cache_path))
            changed = dense.copy(); changed[0][0] += .1
            np.savez_compressed(cache_path, encoderCosine=changed, crossEncoderRawLogit=cross, queryIds=np.asarray(["q", "oos"]), documentIds=np.asarray(["p", "n"]))
            with self.assertRaises(ValueError):
                load_features(path, metadata, dev)

if __name__ == "__main__":
    unittest.main()
