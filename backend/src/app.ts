import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/errors.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use((request, response, next) => {
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const origin = request.get("origin");
  if (isMutation && origin && origin !== env.FRONTEND_ORIGIN) {
    response.status(403).json({ error: "Request origin is not allowed" });
    return;
  }
  next();
});
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api", apiRouter);
app.use(errorHandler);
