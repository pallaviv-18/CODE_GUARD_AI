import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { authRouter } from "./auth.js";
import { projectRouter } from "./projects.js";
import { scanRouter } from "./scans.js";
import { metricsRouter } from "./metrics.js";

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/projects", requireAuth, projectRouter);
apiRouter.use("/scans", requireAuth, scanRouter);
apiRouter.use("/metrics", requireAuth, metricsRouter);
