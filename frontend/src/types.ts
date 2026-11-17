export interface User {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  _count?: { scans: number };
}

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  remediation: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  line: number;
  column: number;
  codeSnippet: string;
  mlCategory: string;
  mlPriority: string;
  mlConfidence: number;
}

export interface Scan {
  id: string;
  projectId: string;
  filename: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  totalFindings: number;
  modelVersion: string | null;
  summary: Record<string, number> | null;
  createdAt: string;
  project?: { id: string; name: string };
  findings?: Finding[];
}

export interface DashboardData {
  summary: { projects: number; scans: number; findings: number; critical: number };
  history: { date: string; findings: number; critical: number }[];
  scans: Scan[];
}
