import axios from "axios";
import { Prisma, ScanStatus, Severity } from "../generated/prisma/client.js";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

export const scanRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
const scanLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const allowedExtensions = new Set([
  ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".php", ".rb",
  ".cs", ".sql", ".html",
]);
const scanInput = z.object({ projectId: z.string().min(1) });

scanRouter.get("/", async (request, response, next) => {
  try {
    const scans = await prisma.scan.findMany({
      where: { project: { userId: request.user!.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { project: { select: { id: true, name: true } } },
    });
    response.json({ scans });
  } catch (error) {
    next(error);
  }
});

scanRouter.get("/dashboard", async (request, response, next) => {
  try {
    const [projects, scans, totalScans, totalFindings, findings] = await Promise.all([
      prisma.project.count({ where: { userId: request.user!.id } }),
      prisma.scan.findMany({
        where: { project: { userId: request.user!.id }, status: ScanStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { findings: { select: { severity: true } } },
      }),
      prisma.scan.count({
        where: { project: { userId: request.user!.id }, status: ScanStatus.COMPLETED },
      }),
      prisma.finding.count({
        where: { scan: { project: { userId: request.user!.id }, status: ScanStatus.COMPLETED } },
      }),
      prisma.finding.count({
        where: { scan: { project: { userId: request.user!.id } }, severity: Severity.CRITICAL },
      }),
    ]);
    const history = [...scans].reverse().map((scan) => ({
      date: scan.createdAt.toISOString().slice(0, 10),
      findings: scan.findings.length,
      critical: scan.findings.filter((finding) => finding.severity === Severity.CRITICAL).length,
    }));
    response.json({
      summary: { projects, scans: totalScans, findings: totalFindings, critical: findings },
      history,
      scans: scans.slice(0, 5).map(({ findings: _findings, ...scan }) => scan),
    });
  } catch (error) {
    next(error);
  }
});

scanRouter.post("/", scanLimit, upload.single("file"), async (request, response, next) => {
  let scanId: string | undefined;
  try {
    const input = scanInput.parse(request.body);
    if (!request.file) {
      response.status(400).json({ error: "Select one source file to scan" });
      return;
    }
    const originalName = path.basename(request.file.originalname.replace(/\\/g, "/"));
    const extension = path.extname(originalName).toLowerCase();
    if (!originalName || !allowedExtensions.has(extension)) {
      response.status(415).json({ error: "Unsupported file type" });
      return;
    }
    if (request.file.buffer.includes(0)) {
      response.status(400).json({ error: "Binary files are not supported" });
      return;
    }
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId: request.user!.id },
      select: { id: true },
    });
    if (!project) {
      response.status(404).json({ error: "Project not found" });
      return;
    }
    const scan = await prisma.scan.create({
      data: { projectId: project.id, filename: originalName, status: ScanStatus.RUNNING },
    });
    scanId = scan.id;

    const analysis = await axios.post<{
      findings: Array<{
        rule_id: string; title: string; description: string; remediation: string;
        severity: string; category: string; line: number; column: number;
        code_snippet: string; ml_category: string; ml_priority: string;
        ml_confidence: number; ml_priority_confidence: number;
      }>;
      summary: Record<string, number>;
      model_version: string;
      metrics: Record<string, unknown>;
    }>(`${env.AI_SERVICE_URL}/analyze`, {
      filename: originalName,
      content: request.file.buffer.toString("utf8"),
    }, {
      timeout: 30_000,
      headers: { "X-Service-Key": env.AI_SERVICE_API_KEY },
    });

    await prisma.$transaction(async (transaction) => {
      if (analysis.data.findings.length) {
        await transaction.finding.createMany({
          data: analysis.data.findings.map((finding) => ({
            scanId: scan.id,
            ruleId: finding.rule_id,
            title: finding.title,
            description: finding.description,
            remediation: finding.remediation,
            severity: finding.severity.toUpperCase() as Severity,
            category: finding.category,
            line: finding.line,
            column: finding.column,
            codeSnippet: finding.code_snippet,
            mlCategory: finding.ml_category,
            mlPriority: finding.ml_priority,
            mlConfidence: finding.ml_confidence,
            mlPriorityConfidence: finding.ml_priority_confidence,
          })),
        });
      }
      await transaction.scan.update({
        where: { id: scan.id },
        data: {
          status: ScanStatus.COMPLETED,
          totalFindings: analysis.data.findings.length,
          summary: analysis.data.summary as Prisma.InputJsonValue,
          modelVersion: analysis.data.model_version,
          completedAt: new Date(),
        },
      });
      await transaction.report.create({
        data: { projectId: project.id, scanId: scan.id, format: "CSV" },
      });
      await transaction.modelVersion.upsert({
        where: { id: analysis.data.model_version },
        create: {
          id: analysis.data.model_version,
          dataset: String(analysis.data.metrics.dataset),
          metrics: analysis.data.metrics as Prisma.InputJsonValue,
        },
        update: {
          dataset: String(analysis.data.metrics.dataset),
          metrics: analysis.data.metrics as Prisma.InputJsonValue,
        },
      });
      await transaction.auditLog.create({
        data: { userId: request.user!.id, action: "scan.completed", metadata: { scanId: scan.id } },
      });
    });
    const completed = await prisma.scan.findUnique({
      where: { id: scan.id },
      include: { findings: { orderBy: [{ severity: "asc" }, { line: "asc" }] } },
    });
    response.status(201).json({ scan: completed });
  } catch (error) {
    if (scanId) {
      await prisma.scan.update({
        where: { id: scanId },
        data: { status: ScanStatus.FAILED, completedAt: new Date() },
      }).catch((updateError: unknown) => console.error("Could not mark scan as failed", updateError));
    }
    if (axios.isAxiosError(error)) {
      response.status(502).json({ error: "The analysis service is unavailable or rejected the scan" });
      return;
    }
    next(error);
  }
});

scanRouter.get("/:scanId", async (request, response, next) => {
  try {
    const scan = await prisma.scan.findFirst({
      where: { id: request.params.scanId, project: { userId: request.user!.id } },
      include: { project: { select: { id: true, name: true } }, findings: { orderBy: [{ severity: "asc" }, { line: "asc" }] } },
    });
    if (!scan) {
      response.status(404).json({ error: "Scan not found" });
      return;
    }
    response.json({ scan });
  } catch (error) {
    next(error);
  }
});

scanRouter.get("/:scanId/report.csv", async (request, response, next) => {
  try {
    const scan = await prisma.scan.findFirst({
      where: { id: request.params.scanId, project: { userId: request.user!.id } },
      include: { findings: { orderBy: [{ severity: "asc" }, { line: "asc" }] } },
    });
    if (!scan) {
      response.status(404).json({ error: "Scan not found" });
      return;
    }
    const quote = (value: string | number): string => {
      const text = String(value);
      const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["file", "line", "column", "severity", "category", "rule_id", "title", "description", "remediation", "ml_category", "ml_priority", "ml_confidence"],
      ...scan.findings.map((finding) => [
        scan.filename, finding.line, finding.column, finding.severity.toLowerCase(),
        finding.category, finding.ruleId, finding.title, finding.description,
        finding.remediation, finding.mlCategory, finding.mlPriority,
        finding.mlConfidence,
      ]),
    ];
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="codeguard-${scan.id}.csv"`);
    response.send(rows.map((row) => row.map(quote).join(",")).join("\r\n"));
  } catch (error) {
    next(error);
  }
});
