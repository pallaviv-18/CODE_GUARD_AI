import csv
from pathlib import Path
from typing import Any

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier

MODEL_VERSION = "curated-synthetic-v1"
DATASET = Path(__file__).resolve().parents[1] / "data" / "issue_examples.csv"

with DATASET.open(encoding="utf-8", newline="") as dataset_file:
    ROWS = list(csv.DictReader(dataset_file))

_category_pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
    ("classifier", LogisticRegression(max_iter=1000, random_state=17)),
])
_priority_pipeline = Pipeline([
    ("features", DictVectorizer(sparse=False)),
    ("classifier", RandomForestClassifier(
        n_estimators=160, min_samples_leaf=2, class_weight="balanced",
        random_state=17,
    )),
])


def _priority_features(category: str, severity: str, confidence: float,
                       externally_reachable: bool, sensitive_data: bool) -> dict[str, Any]:
    return {
        "category": category,
        "severity": severity,
        "confidence": float(confidence),
        "externally_reachable": int(externally_reachable),
        "sensitive_data": int(sensitive_data),
    }


def _evaluate(labels: list[str], predictions: list[str], classes: list[str]) -> dict[str, Any]:
    return {
        "accuracy": round(float(accuracy_score(labels, predictions)), 4),
        "precision_macro": round(float(precision_score(
            labels, predictions, average="macro", zero_division=0
        )), 4),
        "recall_macro": round(float(recall_score(
            labels, predictions, average="macro", zero_division=0
        )), 4),
        "f1_macro": round(float(f1_score(
            labels, predictions, average="macro", zero_division=0
        )), 4),
        "labels": classes,
        "confusion_matrix": confusion_matrix(
            labels, predictions, labels=classes
        ).tolist(),
    }


def _train_and_evaluate() -> dict[str, Any]:
    descriptions = [row["description"] for row in ROWS]
    categories = [row["category"] for row in ROWS]
    priorities = [row["priority"] for row in ROWS]
    category_indices, category_test_indices = train_test_split(
        list(range(len(ROWS))), test_size=0.25, random_state=17,
        stratify=categories,
    )
    priority_indices, priority_test_indices = train_test_split(
        list(range(len(ROWS))), test_size=0.25, random_state=17,
        stratify=priorities,
    )

    category_eval = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("classifier", LogisticRegression(max_iter=1000, random_state=17)),
    ])
    category_eval.fit([descriptions[i] for i in category_indices],
                      [categories[i] for i in category_indices])
    category_pred = category_eval.predict([descriptions[i] for i in category_test_indices])

    priority_rows = [
        _priority_features(row["category"], row["severity"], float(row["confidence"]),
                           row["externally_reachable"] == "true",
                           row["sensitive_data"] == "true")
        for row in ROWS
    ]
    priority_eval = Pipeline([
        ("features", DictVectorizer(sparse=False)),
        ("classifier", RandomForestClassifier(
            n_estimators=160, min_samples_leaf=2, class_weight="balanced",
            random_state=17,
        )),
    ])
    priority_eval.fit([priority_rows[i] for i in priority_indices],
                      [priorities[i] for i in priority_indices])
    priority_pred = priority_eval.predict([priority_rows[i] for i in priority_test_indices])

    _category_pipeline.fit(descriptions, categories)
    _priority_pipeline.fit(priority_rows, priorities)
    return {
        "dataset_rows": len(ROWS),
        "evaluation": "stratified 75/25 holdout, random_state=17",
        "category_classification": _evaluate(
            [categories[i] for i in category_test_indices], list(category_pred),
            sorted(set(categories)),
        ),
        "priority_classification": _evaluate(
            [priorities[i] for i in priority_test_indices], list(priority_pred),
            sorted(set(priorities)),
        ),
    }


_METRICS = _train_and_evaluate()


def predict_category(text: str) -> tuple[str, float]:
    probabilities = _category_pipeline.predict_proba([text])[0]
    index = int(probabilities.argmax())
    return str(_category_pipeline.classes_[index]), float(probabilities[index])


def predict_priority(category: str, severity: str, confidence: float,
                     externally_reachable: bool, sensitive_data: bool) -> tuple[str, float]:
    features = _priority_features(category, severity, confidence,
                                   externally_reachable, sensitive_data)
    probabilities = _priority_pipeline.predict_proba([features])[0]
    index = int(probabilities.argmax())
    return str(_priority_pipeline.classes_[index]), float(probabilities[index])


def model_metrics() -> dict[str, Any]:
    return {
        "model_version": MODEL_VERSION,
        "dataset": "Authored synthetic examples; see ai-service/data/README.md",
        **_METRICS,
    }
