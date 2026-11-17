import csv
import os
import re
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from app.ml import MODEL_VERSION, model_metrics, predict_category, predict_priority

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
app = FastAPI(title="CodeGuard AI Analysis Service", version="0.1.0")
API_KEY = os.getenv("AI_SERVICE_API_KEY", "local-development-key")
ALLOWED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".php", ".rb",
    ".cs", ".sql", ".html",
}
MAX_SOURCE_BYTES = 2 * 1024 * 1024


class AnalysisRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content: str = Field(max_length=MAX_SOURCE_BYTES)


class Finding(BaseModel):
    rule_id: str
    title: str
    description: str
    remediation: str
    severity: str
    category: str
    line: int
    column: int = 1
    code_snippet: str
    ml_category: str
    ml_priority: str
    ml_confidence: float
    ml_priority_confidence: float


class AnalysisResponse(BaseModel):
    filename: str
    findings: list[Finding]
    summary: dict[str, int]
    model_version: str
    metrics: dict[str, Any]


def verify_service_key(x_service_key: str | None = Header(default=None)) -> None:
    if API_KEY and x_service_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid service credentials")


def _finding(rule_id: str, title: str, description: str, remediation: str,
             severity: str, category: str, line: int, content: str,
             column: int = 1) -> dict[str, Any]:
    snippet = content.splitlines()[line - 1].strip()[:300] if content.splitlines() else ""
    snippet = re.sub(
        r"""(?i)((?:password|passwd|secret|api[_-]?key)\s*[:=]\s*['"])[^'"]*(['"])""",
        r"\1[REDACTED]\2",
        snippet,
    )
    category_prediction, confidence = predict_category(
        f"{title}. {description}. {snippet}"
    )
    priority_prediction, priority_confidence = predict_priority(
        category, severity, confidence, category in {"security", "dependency"},
        rule_id in {"security.hardcoded-secret", "security.sql-concatenation"},
    )
    return {
        "rule_id": rule_id,
        "title": title,
        "description": description,
        "remediation": remediation,
        "severity": severity,
        "category": category,
        "line": line,
        "column": column,
        "code_snippet": snippet,
        "ml_category": category_prediction,
        "ml_priority": priority_prediction,
        "ml_confidence": round(confidence, 4),
        "ml_priority_confidence": round(priority_confidence, 4),
    }


def analyze_source(filename: str, content: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    lines = content.splitlines()

    def add(rule_id: str, title: str, description: str, remediation: str,
            severity: str, category: str, line: int, column: int = 1) -> None:
        findings.append(_finding(
            rule_id, title, description, remediation, severity, category, line,
            content, column,
        ))

    if Path(filename).suffix.lower() == ".py":
        try:
            import ast
            ast.parse(content, filename=filename)
        except SyntaxError as error:
            add("python.syntax-error", "Python syntax error",
                error.msg, "Fix the syntax error before running or merging this file.",
                "high", "bug", max(1, error.lineno or 1), max(1, error.offset or 1))

        try:
            import ast

            class Visitor(ast.NodeVisitor):
                def visit_Call(self, node: ast.Call) -> None:
                    name = node.func.id if isinstance(node.func, ast.Name) else ""
                    if name in {"eval", "exec"}:
                        add("python.dynamic-execution", f"Use of {name}()",
                            f"{name}() evaluates dynamic input and can enable code injection.",
                            "Avoid dynamic evaluation; parse input as data and use a constrained operation.",
                            "high", "security", node.lineno, node.col_offset + 1)
                    self.generic_visit(node)

                def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
                    if node.type is None or (
                        isinstance(node.type, ast.Name) and node.type.id == "Exception"
                    ):
                        add("python.broad-exception", "Overly broad exception handler",
                            "Catching every exception can hide programming errors and interrupt diagnosis.",
                            "Catch the specific expected exception and handle or propagate other failures.",
                            "low", "quality", node.lineno, node.col_offset + 1)
                    self.generic_visit(node)

            Visitor().visit(ast.parse(content, filename=filename))
        except SyntaxError:
            pass

    patterns = [
        (re.compile(r"""(?i)(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{4,}['"]"""),
         ("security.hardcoded-secret", "Possible hardcoded secret",
          "A credential-like value appears to be assigned directly in source.",
          "Move secrets to a managed secret store or environment configuration and rotate exposed credentials.",
          "critical", "security")),
        (re.compile(r"""(?i)(?:execute|executemany|query)\s*\([^)]*(?:%s|\\?\+|\.format\s*\(|f['"])"""),
         ("security.sql-concatenation", "Possible SQL query construction from strings",
          "The query appears to use string formatting or concatenation, which may be unsafe with untrusted input.",
          "Use parameterized queries and pass user-controlled values as parameters.",
          "high", "security")),
        (re.compile(r"""(?i)\b(?:verify\s*=\s*False|rejectUnauthorized\s*:\s*false|CURLOPT_SSL_VERIFYPEER\s*=>\s*false)\b"""),
         ("security.tls-verification-disabled", "TLS certificate verification disabled",
          "Disabling certificate checks makes connections vulnerable to interception.",
          "Enable certificate verification and configure trusted certificates when necessary.",
          "high", "security")),
        (re.compile(r"""(?i)\b(?:debug\s*=\s*True|app\.run\s*\([^)]*debug\s*=\s*True)\b"""),
         ("quality.debug-enabled", "Debug mode enabled",
          "Debug mode may expose diagnostics or internal details if deployed.",
          "Disable debug mode in production and configure it through environment-specific settings.",
          "medium", "quality")),
        (re.compile(r"""(?i)\bsubprocess\.(?:run|Popen|call)\s*\([^)]*shell\s*=\s*True"""),
         ("security.shell-execution", "Shell execution enabled",
          "Shell invocation can interpret untrusted input as commands.",
          "Pass an argument array with shell disabled and validate every externally controlled argument.",
          "high", "security")),
        (re.compile(r"""(?i)\b(?:time\.sleep|readFileSync|writeFileSync)\s*\("""),
         ("performance.blocking-operation", "Potentially blocking operation",
          "A synchronous or blocking operation may stall concurrent request processing.",
          "Use an asynchronous API or move blocking work to a bounded worker when this runs on a request path.",
          "medium", "performance")),
    ]
    for line_number, line in enumerate(lines, start=1):
        for pattern, data in patterns:
            match = pattern.search(line)
            if match:
                add(*data, line_number, match.start() + 1)
        if len(line) > 160:
            add("quality.long-line", "Long source line",
                "This line is longer than 160 characters and can be harder to scan and maintain.",
                "Extract expressions or wrap the line to improve readability.",
                "low", "quality", line_number)

    return findings


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_version": MODEL_VERSION}


@app.get("/metrics", dependencies=[Depends(verify_service_key)])
def metrics() -> dict[str, Any]:
    return model_metrics()


@app.post("/analyze", response_model=AnalysisResponse,
          dependencies=[Depends(verify_service_key)])
def analyze(request: AnalysisRequest) -> AnalysisResponse:
    filename = Path(request.filename).name
    if not filename or Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported source file type")
    if len(request.content.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=413, detail="Source exceeds the 2 MB limit")

    findings = analyze_source(filename, request.content)
    summary = {severity: 0 for severity in ("critical", "high", "medium", "low")}
    for finding in findings:
        summary[finding["severity"]] += 1
    return AnalysisResponse(
        filename=filename,
        findings=findings,
        summary=summary,
        model_version=MODEL_VERSION,
        metrics=model_metrics(),
    )
