import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Validation failed", details: error.flatten() });
    return;
  }
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    response.status(status).json({ error: status === 413 ? "File exceeds the 2 MB limit" : error.message });
    return;
  }
  const status = (error as { status?: number }).status;
  if (status && status >= 400 && status < 600) {
    response.status(status).json({ error: error instanceof Error ? error.message : "Request failed" });
    return;
  }
  console.error("Unhandled API error", error);
  response.status(500).json({ error: "Internal server error" });
}
