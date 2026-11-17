import { UserRole } from "../generated/prisma/client.js";
import type { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../env.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  const token = request.cookies?.codeguard_session as string | undefined;
  if (!token) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (typeof payload.sub !== "string" || !Object.values(UserRole).includes(payload.role)) {
      response.status(401).json({ error: "Invalid session" });
      return;
    }
    request.user = { id: payload.sub, role: payload.role as UserRole };
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired session" });
  }
}

export function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  if (request.user?.role !== UserRole.ADMIN) {
    response.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
}
