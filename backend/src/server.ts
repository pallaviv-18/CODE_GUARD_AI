import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`CodeGuard API listening on port ${env.PORT}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
