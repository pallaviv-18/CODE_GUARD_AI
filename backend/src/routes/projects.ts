import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const projectRouter = Router();
const projectInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

projectRouter.get("/", async (request, response, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: request.user!.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { scans: true } } },
    });
    response.json({ projects });
  } catch (error) {
    next(error);
  }
});

projectRouter.post("/", async (request, response, next) => {
  try {
    const input = projectInput.parse(request.body);
    const project = await prisma.project.create({
      data: { ...input, userId: request.user!.id },
    });
    response.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

projectRouter.get("/:projectId", async (request, response, next) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: request.params.projectId, userId: request.user!.id },
    });
    if (!project) {
      response.status(404).json({ error: "Project not found" });
      return;
    }
    response.json({ project });
  } catch (error) {
    next(error);
  }
});

projectRouter.delete("/:projectId", async (request, response, next) => {
  try {
    const result = await prisma.project.deleteMany({
      where: { id: request.params.projectId, userId: request.user!.id },
    });
    if (!result.count) {
      response.status(404).json({ error: "Project not found" });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});
