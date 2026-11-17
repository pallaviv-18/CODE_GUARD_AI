# API reference

Base URL: `http://localhost:4000/api`. Protected routes require the `codeguard_session` HTTP-only cookie returned by registration or login. The API accepts JSON except for scan creation, which uses multipart form data. Errors use `{ "error": "..." }`; validation errors may include `details`.

## Authentication

| Method | Path | Request | Result |
|---|---|---|---|
| POST | `/auth/register` | `{ "name", "email", "password" }` | 201 and current user |
| POST | `/auth/login` | `{ "email", "password" }` | 200 and current user |
| POST | `/auth/logout` | — | 204; clears session cookie |
| GET | `/auth/me` | — | Current user |

Passwords must contain at least 10 characters and no more than 72 UTF-8 bytes (bcrypt's input limit); email is normalized to lowercase. Login and registration share a rate limit.

## Projects

| Method | Path | Request | Result |
|---|---|---|---|
| GET | `/projects` | — | Projects owned by the session user |
| POST | `/projects` | `{ "name", "description?" }` | 201 and created project |
| GET | `/projects/:projectId` | — | One owned project |
| DELETE | `/projects/:projectId` | — | 204; cascades to associated scans |

Project names are 1–100 characters. Descriptions are optional and limited to 500 characters.

## Scans and reports

| Method | Path | Request | Result |
|---|---|---|---|
| GET | `/scans` | — | Up to 100 newest scans owned by the user |
| GET | `/scans/dashboard` | — | Persisted dashboard totals, history, latest scans |
| POST | `/scans` | multipart `projectId` and one `file` | 201 and completed scan with findings |
| GET | `/scans/:scanId` | — | Owned scan and findings |
| GET | `/scans/:scanId/report.csv` | — | Downloadable CSV |

Accepted extensions are `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, `.java`, `.go`, `.php`, `.rb`, `.cs`, `.sql`, and `.html`. Each file is limited to 2 MiB. Raw file contents are held in memory for analysis and not persisted; short excerpts around findings are persisted with scan history, with detected hardcoded secrets redacted. Source is never executed.

Finding fields explicitly distinguish static rule `severity`, `category`, and `ruleId` from `mlCategory`, `mlPriority`, and their confidence values. `remediation` is authored rule guidance.

## Analysis service

FastAPI docs are served at `http://localhost:8000/docs`. `GET /health` is public. `POST /analyze` and `GET /metrics` require `X-Service-Key`, configured by `AI_SERVICE_API_KEY`. The metrics response includes actual holdout scores and confusion matrices for both classifiers. The small synthetic dataset is illustrative only; see [ai-service/data/README.md](../ai-service/data/README.md).

## Authorization

Every project and scan query is scoped to the authenticated user. The database includes role support for future admin workflows, but this release does not expose admin-management endpoints.
