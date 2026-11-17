# Database

PostgreSQL 16 is the supported database. The Prisma schema and reviewed initial migration are under [backend/prisma/](../backend/prisma/schema.prisma); Prisma 7 CLI configuration is in `backend/prisma.config.ts`.

All rows are related through foreign keys and use database cascades for user/project/scan deletion. Migrations should be applied with `npm run db:migrate --workspace backend` during development and `npx prisma migrate deploy` in deployments. Never commit production credentials.
