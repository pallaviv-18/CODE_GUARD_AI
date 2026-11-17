# CodeGuard AI

CodeGuard AI is a full-stack code-quality and security-analysis capstone. Its first runnable release provides account registration and login, PostgreSQL-backed projects and scans, bounded source uploads, local static rules, a trained and evaluated scikit-learn issue classifier, and downloadable CSV reports.

> **Trust boundaries:** raw uploaded source is stored in memory only for the duration of a request and analyzed as text; it is never executed. Short finding excerpts are stored with scan history, and matched hardcoded-secret snippets are redacted. Static rules are deterministic findings; ML labels and priority are separate predictions; remediation text is rule-based guidance, not a generative AI claim. The training corpus is a small, documented synthetic teaching dataset and is not evidence of production-grade accuracy.

## Architecture

- `frontend/` — React, TypeScript, Vite, Tailwind CSS, Recharts and Axios.
- `backend/` — Express REST API, Zod validation, JWT/bcrypt authentication and Prisma.
- `ai-service/` — FastAPI, Python AST/text rules, scikit-learn training and evaluation.
- `database/` — Prisma schema and migrations.
- `tests/` — cross-component/API test documentation and test configuration.
- `docs/` — API and security notes.
- `infrastructure/` — deployment and CI support.

## Run locally (Windows PowerShell)

Requirements: Node.js 20.19+ (22 recommended), Python 3.11+, and Docker Desktop (or a reachable PostgreSQL 16 instance). Docker is used only for PostgreSQL in this workflow.

1. Copy `.env.example` to `.env` and replace both secrets with random values. For example:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start PostgreSQL:

   ```powershell
   docker compose up -d postgres
   ```

3. Install JavaScript dependencies, generate Prisma Client and apply the migration:

   ```powershell
   npm install
   npm run db:generate
   npm run db:migrate
   ```

4. Create and install the Python environment:

   ```powershell
   py -3 -m venv ai-service\.venv
   .\ai-service\.venv\Scripts\Activate.ps1
   python -m pip install -r ai-service\requirements-test.txt
   ```

5. In separate PowerShell terminals, start the services:

   ```powershell
   # Terminal 1: AI service
   .\ai-service\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --app-dir ai-service --reload --port 8000
   ```

   ```powershell
   # Terminal 2: API and frontend
   npm run dev
   ```

   Open `http://localhost:5173`. FastAPI documentation is available at `http://localhost:8000/docs`; API usage is described in [docs/API.md](docs/API.md).

`npm run build` and `npm run typecheck` validate both JavaScript workspaces. Run focused AI tests and print the measured evaluation report with `npm run test:ai` and `npm run ai:metrics`.

## Docker deployment

Set `POSTGRES_PASSWORD`, `JWT_SECRET`, and `AI_SERVICE_API_KEY` in the shell or deployment secret manager. Build/run all services with `docker compose up --build`. Run Prisma migrations once the database is healthy:

```powershell
docker compose run --rm backend npx prisma migrate deploy
```

For production, terminate TLS at a trusted ingress, restrict database/network access, use managed secrets, configure backups and log retention, and set a specific allowed frontend origin. The included compose file is a convenient single-host demonstration, not a production security boundary.

## Current scope and roadmap

This foundation deliberately avoids fake integrations or placeholder results. The dashboard, account flows, project creation, scan history, findings, CSV export, and model evaluation use persisted API data or measured service output. Current static checks are local Python-AST and text rules; a Semgrep engine, GitHub OAuth/import, PDF generation, administrator workflows, and external deployment manifests are not yet implemented. Do not connect real-world repositories until repository permissions, token storage, privacy, and rate limits are designed and reviewed.

## Dataset and model

The versioned CSV under `ai-service/data/` consists of authored synthetic issue descriptions, categories, severities, and labels. It contains no code harvested from third parties. The training utility uses a stratified holdout and reports measured precision, recall, F1, and confusion matrix; the API exposes those runtime measurements. See [ai-service/README.md](ai-service/README.md) for limitations and reproduction steps.
