import bcrypt from "bcryptjs";
import { Response, Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();
const credentials = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed bcrypt's 72-byte input limit",
  ),
});
const registerInput = credentials.extend({ name: z.string().trim().min(1).max(80) });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

function setSessionCookie(response: Response, userId: string, role: string): void {
  const token = jwt.sign({ role }, env.JWT_SECRET, { subject: userId, expiresIn: "12h" });
  response.cookie("codeguard_session", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
}

authRouter.post("/register", authLimit, async (request, response, next) => {
  try {
    const input = registerInput.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) {
      response.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "user.registered", ipAddress: request.ip } });
    setSessionCookie(response, user.id, user.role);
    response.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", authLimit, async (request, response, next) => {
  try {
    const input = credentials.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      response.status(401).json({ error: "Email or password is incorrect" });
      return;
    }
    await prisma.auditLog.create({ data: { userId: user.id, action: "user.login", ipAddress: request.ip } });
    setSessionCookie(response, user.id, user.role);
    response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_request, response) => {
  response.clearCookie("codeguard_session", {
    httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/",
  });
  response.status(204).end();
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) {
      response.status(401).json({ error: "Account no longer exists" });
      return;
    }
    response.json({ user });
  } catch (error) {
    next(error);
  }
});
