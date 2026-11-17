# Training corpus

`issue_examples.csv` is a small, authored synthetic dataset for demonstrating a reproducible ML pipeline. Each row is a constructed issue description and structured context, not a result scraped from repositories and not a production benchmark. Categories cover security, bug, quality, performance, and dependency issues. The priority labels are illustrative annotations, not ground truth from incident response.

The service trains a TF-IDF/logistic-regression category classifier and a random-forest priority classifier at startup. Both report measured holdout precision, recall, F1, accuracy, and confusion matrices through the protected `/metrics` endpoint. A deterministic stratified 75/25 split with seed 17 is used. Because the corpus is small and synthetic, scores should be treated as a pipeline demonstration only; do not use these predictions as a security gate or claim generalization to real code. Static finding severity is authored by the analysis rule and remains distinct from ML-predicted priority.

To extend the model responsibly, version a legally sourced, privacy-reviewed, representative dataset, document labeling criteria and class balance, retain a held-out test set, compare against a baseline, and monitor drift. Avoid training on proprietary source without explicit authorization.
