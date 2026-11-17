import json

from app.ml import model_metrics

print(json.dumps(model_metrics(), indent=2))
