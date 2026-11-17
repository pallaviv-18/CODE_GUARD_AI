# Infrastructure

`docker-compose.yml` runs PostgreSQL, the FastAPI analysis service, the Express API, and the static Vite build. The initial Prisma SQL migration is checked in under `backend/prisma/migrations/`; apply it with `npx prisma migrate deploy` in the backend container after the database is ready.

GitHub Actions typechecks/builds both JavaScript workspaces and runs the Python unit tests. Deployment secrets must be configured in the hosting platform; the example compose defaults are for local development only.
