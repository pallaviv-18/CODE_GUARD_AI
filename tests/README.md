# Test strategy

The AI service has focused `unittest` cases for syntax/dynamic-execution detection, finding provenance fields, and measured model evaluation output:

```powershell
python -m unittest discover -s ai-service\tests
```

JavaScript workspaces use the following type and production build checks:

```powershell
npm run typecheck
npm run build
```

API integration tests should run against an isolated PostgreSQL database and test registration/login cookie behavior, ownership boundaries, upload size/type rejection, analysis-service failure states, and CSV escaping. They are not represented as passing until a real test suite exists; do not treat this document as a test result.
