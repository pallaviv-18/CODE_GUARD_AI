# AI analysis service

FastAPI analyzes source as text and AST; it never imports, executes, or compiles uploaded files. Request size and extension validation are enforced in the service as well as at the API boundary.

Static rule findings are deterministic checks (Python AST and language-neutral patterns). Each finding also includes an ML-predicted category and priority, with confidence values. Remediation is rule-authored guidance. This release intentionally does not claim to generate explanations using a language model.

The scikit-learn models train from `data/issue_examples.csv` on startup. `/metrics` exposes holdout scores computed from a reproducible stratified split; the documented synthetic dataset is illustrative and too small to support claims about real-world performance.

Run `python ai-service\train.py` from the repository root to train and print the measured evaluation report. The runtime fits the final inference models on the full corpus only after computing the holdout evaluation.
