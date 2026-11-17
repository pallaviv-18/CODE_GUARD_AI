# Security notes

- Uploaded source is size/extension checked by Express and FastAPI, held in memory, and passed as text. It is not executed, imported, compiled, or written to disk. Raw uploads are not retained, but relevant finding line excerpts are stored with scan history; detected hardcoded-secret snippets are redacted.
- Upload basenames are normalized before use; paths are never used as storage destinations.
- Passwords use bcrypt with cost 12. Session JWTs are short-lived and stored in HTTP-only, SameSite=Lax cookies. Configure HTTPS and production secrets before deployment.
- API authentication/authorization scopes projects and scans to the current user. JSON requests are bounded, Helmet headers are enabled, and authentication routes are rate-limited.
- PostgreSQL credentials, JWT signing key, and internal service key are environment configuration. Never commit real values.
- Static checks are heuristics, not a complete security audit. ML scores use a small synthetic teaching corpus and must not be used as a gate.

Before production use: enforce HTTPS and a strict trusted-origin policy, configure CSRF protections for the deployment topology, rotate managed secrets, add per-user scan quotas, instrument audit-log retention, review dependency vulnerabilities, and threat-model repository access. Do not fetch arbitrary repository URLs on the backend; that creates SSRF and credential exposure risks.
