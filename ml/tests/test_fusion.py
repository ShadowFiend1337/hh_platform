"""DEV-only score calibration tests, without models or network access."""
import copy
import tempfile
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import canonical_hash, relevance_matrix, retrieval_metrics, threshold_from_scores, sha256_file
from prepare_fusion import fit_lda, fit_qda, score_fusion, load_dev_cache
from reranker import FUSION_KIND, FUSION_POLICY, FUSION_SHRINK, QDA_FUSION_KIND, QDA_FUSION_POLICY, validate_score_calibration, version_fingerprint, calibration_parameters_hash

class FusionTests(unittest.TestCase):
    def test_pooled_lda_matches_closed_form_fixed_shrink(self):
        x = np.asarray([[.8, 1.], [.7, 3.], [.9, 2.], [.2, -3.], [.1, -2.], [.3, -4.]])
        y = np.asarray([True, True, True, False, False, False])
        result = fit_lda(x, y)
        positive, negative = x[y], x[~y]
        centered_positive, centered_negative = positive - positive.mean(0), negative - negative.mean(0)
        pooled = (centered_positive.T @ centered_positive + centered_negative.T @ centered_negative) / 4
        covariance = .9 * pooled + .1 * np.diag(np.diag(pooled))
        expected = np.linalg.solve(covariance, positive.mean(0) - negative.mean(0))
        np.testing.assert_allclose(result["weights"], expected)
        self.assertAlmostEqual(result["bias"], -.5 * (positive.mean(0) + negative.mean(0)) @ expected)
        self.assertTrue(result["statistics"]["equalClassPriors"])

    def test_lda_refuses_non_finite_and_degenerate_features(self):
        y = [True, True, False, False]
        for features in [[[0, 0]] * 4, [[1, 2], [2, 3], [3, 4], [np.nan, 5]], [[1], [2], [3], [4]]]:
            with self.assertRaises(ValueError):
                fit_lda(features, y)
        with self.assertRaises(ValueError):
            fit_lda([[1, 2], [2, 3], [3, 4], [4, 5]], [True] * 4)

    def test_qda_polynomial_matches_class_gaussian_log_density_ratio(self):
        x = np.asarray([[.8, 1.], [.7, 3.], [.9, 2.], [.75, 2.5],
                        [.2, -3.], [.1, -2.], [.3, -4.], [.15, -1.]])
        y = np.asarray([True] * 4 + [False] * 4)
        fitted = fit_qda(x, y)
        probes = np.asarray([[.85, 1.5], [.12, -2.5], [.5, -1.], [.3, 2.]])
        densities = []
        for positive in (False, True):
            values = x[y == positive]; mean = values.mean(0)
            covariance = np.cov(values, rowvar=False, ddof=1)
            covariance = .9 * covariance + .1 * np.diag(np.diag(covariance))
            difference = probes - mean
            densities.append(-.5 * np.einsum("ij,jk,ik->i", difference, np.linalg.inv(covariance), difference)
                             -.5 * np.linalg.slogdet(covariance)[1])
        np.testing.assert_allclose(score_fusion(probes, fitted), densities[1] - densities[0], rtol=1e-12, atol=1e-12)
        self.assertEqual(fitted["quadraticMatrix"][0][1], fitted["quadraticMatrix"][1][0])
        self.assertTrue(fitted["statistics"]["equalClassPriors"])

    def test_qda_rejects_degenerate_class_and_non_finite_features(self):
        with self.assertRaises(ValueError):
            fit_qda([[1., 2.], [1., 2.], [3., 4.], [4., 5.]], [True, True, False, False])
        with self.assertRaises(ValueError):
            fit_qda([[1., 2.], [2., 3.], [3., 4.], [4., np.inf]], [True, True, False, False])

    def test_cache_digest_ids_report_and_no_test_guards(self):
        dev = dict(documents=[dict(id="p", split="dev"), dict(id="n", split="train")],
                   queries=[dict(id="q", split="dev", relevant=["p"])])
        scores = np.asarray([[2., -3.]], dtype=np.float32)
        truth = relevance_matrix(dev["queries"], dev["documents"])
        report = dict(split="dev", heldOutScored=False, documentPairs=2,
                      thresholdSelection=threshold_from_scores(scores, truth), ranking=retrieval_metrics(scores, truth))
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "scores.npz"
            np.savez_compressed(path, scores=scores, queryIds=np.asarray(["q"]), documentIds=np.asarray(["p", "n"]))
            digest = sha256_file(path)
            np.testing.assert_array_equal(load_dev_cache(path, digest, dev, report), scores)
            with self.assertRaises(ValueError):
                load_dev_cache(path, "0" * 64, dev, report)
            changed = copy.deepcopy(dev); changed["documents"][0]["split"] = "test"
            with self.assertRaises(ValueError):
                load_dev_cache(path, digest, changed, report)
            changed = copy.deepcopy(dev); changed["documents"].reverse()
            with self.assertRaises(ValueError):
                load_dev_cache(path, digest, changed, report)
            changed = copy.deepcopy(report); changed["thresholdSelection"]["threshold"] += .1
            with self.assertRaises(ValueError):
                load_dev_cache(path, digest, dev, changed)

    def test_optional_calibration_changes_stage_hash_preserves_legacy_hash(self):
        stage = dict(baseModel="model", revision="revision", weightsSha256="a" * 64,
                     fileHashes={"weights": "b" * 64}, policy={"x": 1}, threshold=-3.,
                     calibration=dict(datasetSha256="c" * 64))
        legacy_payload = dict(baseModel=stage["baseModel"], revision=stage["revision"],
                              weightsSha256=stage["weightsSha256"], fileHashes=stage["fileHashes"],
                              policy=stage["policy"], threshold=stage["threshold"],
                              calibrationDatasetSha256=stage["calibration"]["datasetSha256"])
        self.assertEqual(version_fingerprint(stage), canonical_hash(legacy_payload))
        hashes = dict(datasetSha256="c" * 64, encodingFingerprint="d" * 64, encoderWeightsSha256="e" * 64,
                      rerankerWeightsSha256="a" * 64, sourceMetadataSha256="f" * 64, crossScoresSha256="0" * 64,
                      crossCalibrationSha256="1" * 64, devRecordsSha256="2" * 64, denseScoresSha256="3" * 64,
                      calibrationSourceSha256="4" * 64)
        calibration = dict(kind=FUSION_KIND, weights=[2., 3.], bias=1., threshold=5., shrink=FUSION_SHRINK,
                           featurePolicy=copy.deepcopy(FUSION_POLICY), split="dev", hashes=hashes,
                           DEVmetrics=dict(resubstitution=True, heldOutScored=False))
        self.assertEqual(validate_score_calibration(calibration, stage), calibration)
        changed = copy.deepcopy(stage); changed["scoreCalibration"] = copy.deepcopy(calibration)
        self.assertNotEqual(version_fingerprint(stage), version_fingerprint(changed))
        changed["scoreCalibration"]["weights"][0] += .01
        another = copy.deepcopy(stage); another["scoreCalibration"] = calibration
        self.assertNotEqual(version_fingerprint(another), version_fingerprint(changed))
        for key, bad in [("weights", [True, 2.]), ("weights", [float("nan"), 2.]), ("bias", float("inf")),
                         ("threshold", "5"), ("split", "test"), ("shrink", .2), ("featurePolicy", {})]:
            changed = copy.deepcopy(calibration); changed[key] = bad
            with self.assertRaises(ValueError):
                validate_score_calibration(changed, stage)
        changed = copy.deepcopy(calibration); changed["hashes"]["rerankerWeightsSha256"] = "5" * 64
        with self.assertRaises(ValueError):
            validate_score_calibration(changed, stage)
        linear_with_matrix = copy.deepcopy(calibration); linear_with_matrix["quadraticMatrix"] = [[0., 0.], [0., 0.]]
        with self.assertRaises(ValueError):
            validate_score_calibration(linear_with_matrix, stage)
        qda = copy.deepcopy(calibration)
        qda.update(kind=QDA_FUSION_KIND, featurePolicy=QDA_FUSION_POLICY, quadraticMatrix=[[.2, -.1], [-.1, -.3]])
        qda["hashes"]["parametersSha256"] = calibration_parameters_hash(qda)
        self.assertEqual(validate_score_calibration(qda, stage), qda)
        with_qda = copy.deepcopy(stage); with_qda["scoreCalibration"] = qda
        changed_qda = copy.deepcopy(with_qda); changed_qda["scoreCalibration"]["quadraticMatrix"][0][0] += .1
        self.assertNotEqual(version_fingerprint(with_qda), version_fingerprint(changed_qda))
        with self.assertRaisesRegex(ValueError, "parameter hash"):
            validate_score_calibration(changed_qda["scoreCalibration"], stage)
        for bad_matrix in [None, [[1., 0.]], [[1., 0.], [1e-15, 1.]], [[1., float("nan")], [float("nan"), 1.]], [[1., True], [True, 1.]]]:
            changed = copy.deepcopy(qda); changed["quadraticMatrix"] = bad_matrix
            with self.assertRaises(ValueError):
                validate_score_calibration(changed, stage)

if __name__ == "__main__":
    unittest.main()
