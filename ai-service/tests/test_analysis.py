import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import API_KEY, analyze_source, app
from app.ml import model_metrics

client = TestClient(app)


class AnalysisTests(unittest.TestCase):
    def test_detects_python_syntax_error_and_dynamic_execution(self):
        syntax_findings = analyze_source("sample.py", "def broken(:\n")
        runtime_findings = analyze_source("other.py", "eval(user_input)\n")
        self.assertIn("python.syntax-error", {item["rule_id"] for item in syntax_findings})
        self.assertIn("python.dynamic-execution", {item["rule_id"] for item in runtime_findings})

    def test_findings_include_model_predictions_and_remediation(self):
        long_secret_line = 'password = "swordfish123"  # ' + ("x" * 170)
        findings = analyze_source("app.py", long_secret_line + "\n")
        secret = next(item for item in findings if item["rule_id"] == "security.hardcoded-secret")
        self.assertIn(secret["ml_priority"], {"critical", "high", "medium", "low"})
        self.assertTrue(secret["remediation"])
        self.assertGreaterEqual(secret["ml_confidence"], 0)
        self.assertLessEqual(secret["ml_confidence"], 1)
        self.assertNotIn("swordfish123", secret["code_snippet"])
        self.assertTrue(all("swordfish123" not in item["code_snippet"] for item in findings))

    def test_detects_blocking_performance_patterns(self):
        findings = analyze_source("server.js", "time.sleep(2)\n")
        self.assertIn(
            "performance.blocking-operation",
            {finding["rule_id"] for finding in findings},
        )

    def test_metrics_are_measured_and_include_confusion_matrices(self):
        metrics = model_metrics()
        self.assertEqual(metrics["dataset_rows"], 50)
        self.assertIn("f1_macro", metrics["category_classification"])
        self.assertIn("confusion_matrix", metrics["priority_classification"])

    def test_analysis_endpoint_requires_service_key_and_redacts_secrets(self):
        body = {"filename": "settings.py", "content": 'password = "example-secret-value"\n'}
        unauthorized = client.post("/analyze", json=body)
        self.assertEqual(unauthorized.status_code, 401)

        response = client.post("/analyze", json=body, headers={"X-Service-Key": API_KEY})
        self.assertEqual(response.status_code, 200)
        finding = next(
            item for item in response.json()["findings"]
            if item["rule_id"] == "security.hardcoded-secret"
        )
        self.assertNotIn("example-secret-value", finding["code_snippet"])
        self.assertEqual(response.json()["model_version"], "curated-synthetic-v1")

    def test_analysis_endpoint_rejects_unsupported_extensions(self):
        response = client.post(
            "/analyze",
            json={"filename": "archive.zip", "content": "not source"},
            headers={"X-Service-Key": API_KEY},
        )
        self.assertEqual(response.status_code, 415)


if __name__ == "__main__":
    unittest.main()
