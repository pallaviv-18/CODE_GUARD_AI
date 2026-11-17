import axios from "axios";
import { Router } from "express";
import { env } from "../env.js";

export const metricsRouter = Router();

metricsRouter.get("/model", async (_request, response, next) => {
  try {
    const result = await axios.get(`${env.AI_SERVICE_URL}/metrics`, {
      timeout: 10_000,
      headers: { "X-Service-Key": env.AI_SERVICE_API_KEY },
    });
    response.json(result.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      response.status(502).json({ error: "Model evaluation metrics are unavailable" });
      return;
    }
    next(error);
  }
});
