import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight, Boxes,
  Check, CircleHelp, Code2, FileCode2, FileText, FolderGit2,
  Github, KeyRound, LayoutDashboard, LogOut, Menu, Moon, Plus,
  Settings, Shield, ShieldCheck, Sparkles, Sun, Upload, X,
} from "lucide-react";
import { api, errorMessage } from "./api";
import type { DashboardData, Finding, Project, Scan, User } from "./types";

type Page = "overview" | "scans" | "findings" | "projects" | "reports" | "settings";
interface ClassifierMetrics {
  accuracy: number;
  precision_macro: number;
  recall_macro: number;
  f1_macro: number;
  labels: string[];
  confusion_matrix: number[][];
}
interface ModelMetrics {
  model_version: string;
  dataset_rows: number;
  evaluation: string;
  category_classification: ClassifierMetrics;
  priority_classification: ClassifierMetrics;
}
const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "scans", label: "Scan history", icon: Activity },
  { id: "findings", label: "Findings", icon: Shield },
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "reports", label: "Reports", icon: FileText },
];
const severityClass: Record<string, string> = {
  CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low",
};
const ActivityChart = lazy(() => import("./components/ActivityChart"));
const apiDocsUrl = import.meta.env.VITE_API_DOCS_URL
  || "https://github.com/pallaviv-18/CODE_GUARD_AI/blob/main/docs/API.md";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showAuth, setShowAuth] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [activeScan, setActiveScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("codeguard-theme") !== "light");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardResponse, projectResponse, scanResponse] = await Promise.all([
        api.get<{ summary: DashboardData["summary"]; history: DashboardData["history"]; scans: Scan[] }>("/scans/dashboard"),
        api.get<{ projects: Project[] }>("/projects"),
        api.get<{ scans: Scan[] }>("/scans"),
      ]);
      setDashboard({
        summary: dashboardResponse.data.summary,
        history: dashboardResponse.data.history,
        scans: dashboardResponse.data.scans,
      });
      setProjects(projectResponse.data.projects);
      setScans(scanResponse.data.scans);
      setActiveScan((current) => {
        const found = scanResponse.data.scans.find((scan) => scan.id === current?.id);
        return found || null;
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get<{ user: User }>("/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (user) void loadWorkspace();
  }, [user, loadWorkspace]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("codeguard-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (toast) {
      const timeout = window.setTimeout(() => setToast(""), 3800);
      return () => window.clearTimeout(timeout);
    }
  }, [toast]);

  const latestFindings = useMemo(() => {
    return activeScan?.findings || [];
  }, [activeScan]);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const body = Object.fromEntries(formData.entries());
    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
      const { data } = await api.post<{ user: User }>(endpoint, body);
      setUser(data.user);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
      setUser(null);
      setDashboard(null);
      setProjects([]);
      setScans([]);
      setShowAuth(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.post("/projects", Object.fromEntries(form.entries()));
      setShowNewProject(false);
      setToast("Project created successfully");
      await loadWorkspace();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function uploadScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ scan: Scan }>("/scans", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setShowUpload(false);
      setPage("findings");
      setActiveScan(result.data.scan);
      setToast(`Analysis complete · ${result.data.scan.findings?.length || 0} findings`);
      await loadWorkspace();
      setActiveScan(result.data.scan);
      setPage("findings");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function openScan(scan: Scan) {
    setActiveScan(scan);
    if (!scan.findings) {
      try {
        const { data } = await api.get<{ scan: Scan }>(`/scans/${scan.id}`);
        setActiveScan(data.scan);
      } catch (requestError) {
        setError(errorMessage(requestError));
      }
    }
    setPage("findings");
  }

  async function downloadReport(scan: Scan) {
    try {
      const { data } = await api.get(`/scans/${scan.id}/report.csv`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `codeguard-${scan.filename.replace(/[^\w.-]/g, "_")}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setToast("CSV report downloaded");
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  if (!authReady) return <div className="boot-screen"><div className="brand-mark"><ShieldCheck size={23} /></div><div className="spinner" /></div>;
  if (!user) {
    return showAuth
      ? <div className="auth-route"><button className="auth-back" onClick={() => { setError(""); setShowAuth(false); }}>← Product overview</button><AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={submitAuth} busy={busy} error={error} /></div>
      : <LandingPage onStart={() => { setAuthMode("register"); setError(""); setShowAuth(true); }} onSignIn={() => { setAuthMode("login"); setError(""); setShowAuth(true); }} />;
  }

  const title = navItems.find((item) => item.id === page)?.label || "Settings";

  return (
    <div className="app-shell">
      {menuOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></div><span>codeguard<span className="brand-ai">.ai</span></span></div>
        <div className="workspace-picker"><div className="workspace-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="workspace-meta"><strong>Personal workspace</strong><span>{user.role === "ADMIN" ? "Administrator" : "Member"} account</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? "nav-active" : ""}`} onClick={() => { setPage(id); setMenuOpen(false); }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {id === "findings" && dashboard?.summary.critical ? <span className="nav-count">{dashboard.summary.critical}</span> : null}
            </button>
          ))}
        </nav>
        <div className="nav-label nav-label-spaced">DEVELOPER TOOLS</div>
        <button className="nav-item" onClick={() => setShowUpload(true)}><Code2 size={17} /><span>New code scan</span></button>
        <button className="nav-item" onClick={() => setPage("settings")}><KeyRound size={17} /><span>Integrations</span><span className="soon-dot" /></button>
        <div className="sidebar-bottom">
          <div className="plan-card"><div className="plan-icon"><Sparkles size={16} /></div><strong>Build with confidence</strong><p>Every issue caught is time saved in production.</p><button onClick={() => setShowUpload(true)}>Run a scan <ArrowRight size={14} /></button></div>
          <button className="nav-item help-link" onClick={() => window.open(apiDocsUrl, "_blank", "noopener,noreferrer")}><CircleHelp size={17} /><span>Documentation</span><ArrowRight size={14} /></button>
          <div className="profile-row"><div className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="profile-meta"><strong>{user.name}</strong><span>{user.email}</span></div><button className="icon-button profile-action" onClick={logout} aria-label="Sign out"><LogOut size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{title}</strong></div></div>
          <div className="topbar-actions"><button className="icon-button theme-toggle" onClick={() => setDarkMode((mode) => !mode)} aria-label="Toggle color theme">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button><div className="top-avatar">{user.name.slice(0, 1).toUpperCase()}</div></div>
        </header>
        {error && <div className="error-banner"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
        {loading ? <div className="page-loading"><div className="spinner" />Loading your workspace…</div> : (
          <div className="page-content">
            {page === "overview" && <Overview data={dashboard} scans={scans} onUpload={() => setShowUpload(true)} onOpenScan={openScan} onNavigate={setPage} />}
            {page === "scans" && <ScanHistory scans={scans} onOpenScan={openScan} onUpload={() => setShowUpload(true)} />}
            {page === "findings" && <FindingsPage scan={activeScan} findings={latestFindings} scans={scans} onSelectScan={openScan} />}
            {page === "projects" && <ProjectsPage projects={projects} scans={scans} onCreate={() => setShowNewProject(true)} onUpload={() => setShowUpload(true)} />}
            {page === "reports" && <ReportsPage scans={scans} onDownload={downloadReport} />}
            {page === "settings" && <SettingsPage user={user} darkMode={darkMode} onToggleTheme={() => setDarkMode((mode) => !mode)} />}
          </div>
        )}
      </main>
      {showNewProject && <Modal title="Create a project" onClose={() => setShowNewProject(false)}><form className="modal-form" onSubmit={createProject}><label>Project name<input name="name" required maxLength={100} placeholder="e.g. Payments API" autoFocus /></label><label>Description <span className="optional">(optional)</span><textarea name="description" maxLength={500} placeholder="What are you building?" rows={3} /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setShowNewProject(false)}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? "Creating…" : "Create project"}</button></div></form></Modal>}
      {showUpload && <Modal title="Scan source code" subtitle="Static analysis runs without executing your file." onClose={() => setShowUpload(false)}><form className="modal-form" onSubmit={uploadScan}><label>Project<select name="projectId" required defaultValue=""><option value="" disabled>Select a project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label className="upload-zone"><Upload size={23} /><strong>Choose a source file</strong><span>Python, JavaScript, TypeScript, Java, Go, PHP, Ruby, C#, SQL or HTML · Max 2 MB</span><input type="file" name="file" required accept=".py,.js,.jsx,.ts,.tsx,.java,.go,.php,.rb,.cs,.sql,.html" /></label>{projects.length === 0 && <p className="inline-notice">Create a project before starting a scan.</p>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setShowUpload(false)}>Cancel</button><button className="button-primary" disabled={busy || projects.length === 0}>{busy ? <><span className="button-spinner" />Analyzing…</> : <><Shield size={15} /> Analyze file</>}</button></div></form></Modal>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function LandingPage({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={21} /></div><span>codeguard<span className="brand-ai">.ai</span></span></div>
        <nav className="landing-nav"><a href="#features">Platform</a><a href="#how-it-works">How it works</a><a href={apiDocsUrl} target="_blank" rel="noreferrer">API docs <ArrowUpRight size={13} /></a></nav>
        <div className="landing-actions"><button className="landing-signin" onClick={onSignIn}>Sign in</button><button className="button-primary" onClick={onStart}>Get started <ArrowRight size={14} /></button></div>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-eyebrow"><span className="pulse-dot" /> CODE QUALITY, WITH CLARITY</div>
          <h1>Catch the things<br />code review <span>misses.</span></h1>
          <p>Understand code risks before they reach production. Analyze source safely, trace every finding, and turn noisy signals into actionable next steps.</p>
          <div className="landing-cta"><button className="button-primary landing-primary" onClick={onStart}>Start your workspace <ArrowRight size={15} /></button><a href={apiDocsUrl} target="_blank" rel="noreferrer">Explore the API <ArrowUpRight size={14} /></a></div>
          <div className="landing-assurance"><span><ShieldCheck size={15} /> Source is never executed</span><span><Check size={14} /> Findings include exact lines</span></div>
        </div>
        <div className="landing-visual">
          <div className="visual-topbar"><div className="window-dots"><i /><i /><i /></div><span>ANALYSIS PIPELINE</span><span className="visual-status"><i /> READY</span></div>
          <div className="visual-file"><FileCode2 size={15} /><span>example source</span><span className="visual-file-tag">NEVER EXECUTED</span></div>
          <div className="visual-code"><span className="visual-line">08</span><code>def process_request(data):</code><span className="visual-line">09</span><code className="code-muted">    # inspected as text, never run</code><span className="visual-line">10</span><code>    query = build_query(data)</code></div>
          <div className="pipeline-list">
            <div className="pipeline-step"><span className="pipeline-icon static"><ShieldCheck size={15} /></span><div><strong>Static analysis</strong><small>Deterministic rules &amp; Python AST</small></div><Check size={14} /></div>
            <div className="pipeline-step"><span className="pipeline-icon learned"><Sparkles size={15} /></span><div><strong>ML classification</strong><small>scikit-learn issue category &amp; priority</small></div><Check size={14} /></div>
            <div className="pipeline-step"><span className="pipeline-icon guidance"><FileText size={15} /></span><div><strong>Remediation guidance</strong><small>Rule-authored, traceable suggestions</small></div><ArrowRight size={14} /></div>
          </div>
          <div className="visual-footnote"><CircleHelp size={13} /><span>Rule findings and model predictions are shown separately.</span></div>
        </div>
      </section>
      <section className="landing-features" id="features">
        <div className="landing-section-head"><div className="landing-eyebrow">BUILT FOR THE WAY YOU BUILD</div><h2>More signal. Less guesswork.</h2><p>A transparent analysis workflow that makes every result easier to understand.</p></div>
        <div className="landing-feature-grid">
          <article className="landing-feature"><div className="feature-mark feature-violet"><Shield size={18} /></div><h3>Security-minded analysis</h3><p>Identify risky patterns like embedded credentials, unsafe SQL construction, and disabled TLS checks—without running submitted code.</p><span>STATIC RULES · EXACT LOCATIONS</span></article>
          <article className="landing-feature"><div className="feature-mark feature-blue"><Sparkles size={18} /></div><h3>ML with provenance</h3><p>See predicted issue categories and priority alongside measured holdout evaluation. Confidence is a model output, not a severity score.</p><span>SCIKIT-LEARN · DOCUMENTED DATA</span></article>
          <article className="landing-feature"><div className="feature-mark feature-green"><Activity size={18} /></div><h3>History you can act on</h3><p>Keep projects, scans, findings, and downloadable CSV reports together to review changes across repeated analyses.</p><span>POSTGRESQL · PERSISTED SCANS</span></article>
        </div>
      </section>
      <section className="landing-bottom" id="how-it-works"><div><div className="landing-eyebrow">YOUR CODE, YOUR CALL</div><h2>Start with one file.<br /><span>See the whole picture.</span></h2><p>Sign up, create a project, and analyze an approved source file. Raw uploads are not retained; short finding excerpts are stored with scan history, with detected hardcoded-secret snippets redacted.</p><button className="button-primary" onClick={onStart}>Create your account <ArrowRight size={14} /></button></div><div className="landing-bottom-aside"><div><Code2 size={17} /><strong>Multiple source formats</strong><span>Python, JavaScript, TypeScript, Java, Go, PHP, Ruby, C#, SQL, HTML</span></div><div><Github size={17} /><strong>Clear scope</strong><span>GitHub import, PDF exports, and admin tools are not part of this foundation release.</span></div></div></section>
      <footer className="landing-footer"><div className="brand"><div className="brand-mark"><ShieldCheck size={18} /></div><span>codeguard<span className="brand-ai">.ai</span></span></div><span>Built for safer software, one finding at a time.</span><button onClick={onSignIn}>Already have an account? Sign in</button></footer>
    </main>
  );
}

function AuthScreen({ mode, setMode, onSubmit, busy, error }: {
  mode: "login" | "register"; setMode: (value: "login" | "register") => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean; error: string;
}) {
  return <div className="auth-page"><div className="auth-art"><div className="art-glow" /><div className="brand auth-brand"><div className="brand-mark"><ShieldCheck size={21} /></div><span>codeguard<span className="brand-ai">.ai</span></span></div><div className="art-copy"><div className="eyebrow"><span className="pulse-dot" /> INTELLIGENT CODE ANALYSIS</div><h1>Ship code<br /><span>with confidence.</span></h1><p>Find bugs before they find you. CodeGuard brings security, quality, and clarity to every line.</p><div className="auth-proof"><div className="proof-icon"><ShieldCheck size={17} /></div><div><strong>Security-first analysis</strong><span>Your source is analyzed, never executed.</span></div></div></div><div className="art-footer"><span>Built for developers who care about what they ship.</span><span>© 2026 CodeGuard AI</span></div></div><div className="auth-panel"><form className="auth-card" onSubmit={onSubmit}><div className="auth-mobile-brand brand"><div className="brand-mark"><ShieldCheck size={20} /></div><span>codeguard<span className="brand-ai">.ai</span></span></div><div className="auth-heading"><div className="auth-kicker">WELCOME {mode === "login" ? "BACK" : "ABOARD"}</div><h2>{mode === "login" ? "Sign in to your account" : "Create your account"}</h2><p>{mode === "login" ? "Your codebase is in good hands." : "Start building more secure software."}</p></div>{error && <div className="auth-error"><AlertTriangle size={16} />{error}</div>}{mode === "register" && <label className="auth-field">Full name<input name="name" required minLength={1} maxLength={80} placeholder="Alex Morgan" autoComplete="name" /></label>}<label className="auth-field">Work email<input name="email" type="email" required maxLength={254} placeholder="you@company.com" autoComplete="email" /></label><label className="auth-field">Password<input name="password" type="password" required minLength={10} maxLength={128} placeholder="At least 10 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label><button className="auth-submit" disabled={busy}>{busy ? <><span className="button-spinner" />Please wait…</> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={16} /></>}</button><p className="auth-switch">{mode === "login" ? "New to CodeGuard?" : "Already have an account?"} <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></p><div className="auth-secure"><ShieldCheck size={14} /> Passwords are securely hashed · Sessions use HTTP-only cookies</div></form></div></div>;
}

function Overview({ data, scans, onUpload, onOpenScan, onNavigate }: {
  data: DashboardData | null; scans: Scan[];
  onUpload: () => void; onOpenScan: (scan: Scan) => void; onNavigate: (page: Page) => void;
}) {
  const summary = data?.summary;
  return (
    <>
      <div className="welcome-row">
        <div><div className="section-eyebrow"><span className="pulse-dot" /> YOUR ENGINEERING OVERVIEW</div><h1>Good to see you<span className="title-period">.</span></h1><p>Here's what's happening across your codebase today.</p></div>
        <button className="button-primary" onClick={onUpload}><Plus size={16} /> New scan</button>
      </div>
      <div className="stat-grid">
        <StatCard label="Total projects" value={summary?.projects ?? 0} change="Active workspaces" icon={Boxes} tone="violet" />
        <StatCard label="Files analyzed" value={summary?.scans ?? 0} change="Across all projects" icon={FileCode2} tone="blue" />
        <StatCard label="Issues detected" value={summary?.findings ?? 0} change="In completed scans" icon={Activity} tone="amber" />
        <StatCard label="Critical issues" value={summary?.critical ?? 0} change="Review recommended" icon={AlertTriangle} tone="red" />
      </div>
      <div className="content-grid">
        <section className="panel chart-panel">
          <div className="panel-header"><div><h2>Code health activity</h2><p>Findings detected in your latest scans</p></div><button className="select-lite" onClick={() => onNavigate("scans")}>View scan history <ArrowRight size={13} /></button></div>
          {data?.history.length ? <Suspense fallback={<div className="chart-wrap chart-loading">Loading chart…</div>}><ActivityChart data={data.history} /></Suspense> : <EmptyState icon={Activity} title="Your activity will appear here" text="Run a scan to start tracking code health over time." action="Start your first scan" onAction={onUpload} />}
          <div className="chart-legend"><span><i className="legend-dot violet-dot" /> Total findings</span><span className="chart-footnote">Static rules · persisted scan history</span></div>
        </section>
        <section className="panel insight-panel">
          <div className="panel-header"><div><h2>Analysis engine</h2><p>Three layers. Clear provenance.</p></div><div className="engine-ready">RULES + ML</div></div>
          <div className="engine-layer"><div className="layer-icon layer-static"><ShieldCheck size={16} /></div><div><strong>Static analysis</strong><span>Deterministic rules &amp; Python AST</span></div><span className="layer-state">Active</span></div>
          <div className="engine-layer"><div className="layer-icon layer-ml"><Sparkles size={16} /></div><div><strong>ML classification</strong><span>scikit-learn · {scans[0]?.modelVersion || "curated-synthetic-v1"}</span></div><span className="layer-state">Active</span></div>
          <div className="engine-layer"><div className="layer-icon layer-guide"><FileText size={16} /></div><div><strong>Remediation guidance</strong><span>Rule-authored suggestions</span></div><span className="layer-state">Active</span></div>
          <div className="engine-note"><CircleHelp size={14} /><span>ML confidence is a model prediction, not a severity score. Holdout metrics are available in Settings.</span></div>
          <div className="engine-footer"><span><i className="legend-dot green-dot" /> Services configured</span><span>API · AI · PostgreSQL</span></div>
        </section>
      </div>
      <div className="panel table-panel">
        <div className="panel-header"><div><h2>Recent scans</h2><p>Your latest code analysis activity</p></div><button className="text-button" onClick={() => onNavigate("scans")}>View all <ArrowRight size={14} /></button></div>
        {scans.length ? <div className="table-scroll"><table><thead><tr><th>FILE / PROJECT</th><th>STATUS</th><th>FINDINGS</th><th>DATE</th><th /></tr></thead><tbody>{scans.slice(0, 5).map((scan) => <tr key={scan.id}><td><button className="file-cell" onClick={() => onOpenScan(scan)}><span className="file-icon"><FileCode2 size={16} /></span><span><strong>{scan.filename}</strong><small>{scan.project?.name || "Project"}</small></span></button></td><td><StatusPill status={scan.status} /></td><td><span className="finding-count">{scan.totalFindings}</span></td><td className="date-cell">{formatDate(scan.createdAt)}</td><td><button className="icon-button row-arrow" onClick={() => onOpenScan(scan)} aria-label="View scan"><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={FileCode2} title="No scans yet" text="Create a project and analyze your first source file." action="Run your first scan" onAction={onUpload} />}
      </div>
      <div className="bottom-note"><span><ShieldCheck size={14} /> Raw source uploads are not retained; matched secrets are redacted in excerpts.</span><span><Github size={14} /> GitHub integration is not connected</span></div>
    </>
  );
}

function StatCard({ label, value, change, icon: Icon, tone }: {
  label: string; value: number; change: string; icon: typeof LayoutDashboard; tone: string;
}) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={17} strokeWidth={1.9} /></div><div className="stat-label">{label}</div><div className="stat-value">{value.toLocaleString()}</div><div className="stat-change">{change}</div></div>;
}

function ScanHistory({ scans, onOpenScan, onUpload }: {
  scans: Scan[]; onOpenScan: (scan: Scan) => void; onUpload: () => void;
}) {
  return (
    <>
      <div className="welcome-row page-title-row">
        <div><div className="section-eyebrow">AUDIT TRAIL</div><h1>Scan history<span className="title-period">.</span></h1><p>Review every analysis run across your projects.</p></div>
        <button className="button-primary" onClick={onUpload}><Plus size={16} /> New scan</button>
      </div>
      <div className="panel table-panel full-panel">
        <div className="panel-header"><div><h2>All scans</h2><p>{scans.length} analysis runs recorded</p></div><span className="scan-list-sort">Latest first</span></div>
        {scans.length ? (
          <div className="table-scroll">
            <table><thead><tr><th>FILE / PROJECT</th><th>STATUS</th><th>FINDINGS</th><th>MODEL</th><th>DATE</th><th /></tr></thead>
              <tbody>{scans.map((scan) => <tr key={scan.id}><td><button className="file-cell" onClick={() => onOpenScan(scan)}><span className="file-icon"><FileCode2 size={16} /></span><span><strong>{scan.filename}</strong><small>{scan.project?.name || "Project"}</small></span></button></td><td><StatusPill status={scan.status} /></td><td><span className="finding-count">{scan.totalFindings}</span></td><td className="model-cell">{scan.modelVersion || "—"}</td><td className="date-cell">{formatDate(scan.createdAt)}</td><td><button className="icon-button row-arrow" onClick={() => onOpenScan(scan)} aria-label="View scan"><ArrowRight size={15} /></button></td></tr>)}</tbody>
            </table>
          </div>
        ) : <EmptyState icon={Activity} title="No analysis history" text="Scans are saved here as soon as your first file is analyzed." action="Start a scan" onAction={onUpload} />}
      </div>
    </>
  );
}

function FindingsPage({ scan, findings, scans, onSelectScan }: {
  scan: Scan | null; findings: Finding[]; scans: Scan[]; onSelectScan: (scan: Scan) => void;
}) {
  const [filter, setFilter] = useState("ALL");
  const filtered = filter === "ALL" ? findings : findings.filter((finding) => finding.severity === filter);
  return <><div className="welcome-row page-title-row"><div><div className="section-eyebrow">ISSUE TRIAGE</div><h1>Findings<span className="title-period">.</span></h1><p>Static-analysis results with separate ML predictions.</p></div><div className="scan-select-wrap"><label htmlFor="findings-scan">Scan</label><select id="findings-scan" value={scan?.id || ""} onChange={(event) => { const selected = scans.find((item) => item.id === event.target.value); if (selected) onSelectScan(selected); }}><option value="" disabled>Select a completed scan</option>{scans.map((item) => <option key={item.id} value={item.id}>{item.filename} · {formatDate(item.createdAt)}</option>)}</select></div></div>{scan ? <><div className="scan-context"><div className="scan-context-icon"><FileCode2 size={18} /></div><div><strong>{scan.filename}</strong><span>Scanned {formatDate(scan.createdAt)} · {scan.totalFindings} findings · {scan.modelVersion || "ML unavailable"}</span></div><span className="context-divider" /><span className="provenance-badge"><ShieldCheck size={13} /> Static rules + ML predictions</span></div><div className="severity-filter">{["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((item) => <button className={filter === item ? "filter-active" : ""} key={item} onClick={() => setFilter(item)}>{item === "ALL" ? "All findings" : item[0] + item.slice(1).toLowerCase()}<span>{item === "ALL" ? findings.length : findings.filter((finding) => finding.severity === item).length}</span></button>)}</div>{filtered.length ? <div className="finding-list">{filtered.map((finding) => <FindingCard finding={finding} key={finding.id || `${finding.ruleId}-${finding.line}`} />)}</div> : <EmptyState icon={ShieldCheck} title={findings.length ? "No findings at this severity" : "No issues detected"} text={findings.length ? "Choose another severity filter to see more results." : "No rules matched. This is not a guarantee that the file is vulnerability-free."} />}</> : <EmptyState icon={Shield} title="Choose a scan to inspect" text="Finding details include exact line numbers, deterministic rules, ML predictions, and remediation guidance." />}</>;
}

function FindingCard({ finding }: { finding: Finding }) {
  return <article className="finding-card"><div className="finding-main"><div className={`severity-icon ${severityClass[finding.severity]}`}><AlertTriangle size={16} /></div><div className="finding-body"><div className="finding-title-row"><h3>{finding.title}</h3><span className={`severity-badge ${severityClass[finding.severity]}`}>{finding.severity}</span></div><p>{finding.description}</p><div className="finding-meta"><span><FileCode2 size={13} /> line {finding.line}:{finding.column}</span><span className="rule-chip">{finding.ruleId}</span><span className="category-chip">{finding.category}</span></div><div className="code-snippet"><span className="line-number">{finding.line}</span><code>{finding.codeSnippet || "(source line unavailable)"}</code></div><div className="remediation"><div className="remediation-title"><Sparkles size={14} /> Remediation guidance <span>RULE-AUTHORED</span></div><p>{finding.remediation}</p></div><div className="ml-row"><div className="ml-label"><span className="ml-indicator" /> ML prediction</div><span>Category <strong>{finding.mlCategory}</strong></span><span>Priority <strong className={`predicted-priority ${severityClass[finding.mlPriority.toUpperCase()] || ""}`}>{finding.mlPriority}</strong></span><span className="confidence-label">Category confidence <strong>{(finding.mlConfidence * 100).toFixed(0)}%</strong></span></div></div></div></article>;
}

function ProjectsPage({ projects, scans, onCreate, onUpload }: {
  projects: Project[]; scans: Scan[]; onCreate: () => void; onUpload: () => void;
}) {
  return <><div className="welcome-row page-title-row"><div><div className="section-eyebrow">YOUR CODEBASES</div><h1>Projects<span className="title-period">.</span></h1><p>Organize source scans by application or team.</p></div><button className="button-primary" onClick={onCreate}><Plus size={16} /> New project</button></div>{projects.length ? <div className="project-grid">{projects.map((project) => { const projectScans = scans.filter((scan) => scan.projectId === project.id); const issues = projectScans.reduce((sum, scan) => sum + scan.totalFindings, 0); return <article className="project-card" key={project.id}><div className="project-card-top"><div className="project-icon"><FolderGit2 size={19} /></div><span className="project-visibility"><span /> PRIVATE</span></div><h3>{project.name}</h3><p>{project.description || "No project description yet."}</p><div className="project-metrics"><span><Activity size={14} /> {projectScans.length} scans</span><span><AlertTriangle size={14} /> {issues} findings</span></div><div className="project-card-footer"><span>Updated {formatDate(project.updatedAt)}</span><button className="text-button" onClick={onUpload}>Scan code <ArrowRight size={14} /></button></div></article>; })}<button className="project-add-card" onClick={onCreate}><span><Plus size={20} /></span><strong>Create a project</strong><small>Organize your code analysis</small></button></div> : <EmptyState icon={FolderGit2} title="Start with a project" text="Projects keep scans and findings organized for each application." action="Create your first project" onAction={onCreate} />}</>;
}

function ReportsPage({ scans, onDownload }: { scans: Scan[]; onDownload: (scan: Scan) => void }) {
  const completedScans = scans.filter((scan) => scan.status === "COMPLETED");
  return <><div className="welcome-row page-title-row"><div><div className="section-eyebrow">SHAREABLE AUDIT OUTPUT</div><h1>Reports<span className="title-period">.</span></h1><p>Download a CSV report for any completed source scan.</p></div><div className="report-format"><FileText size={15} /> CSV export <span>AVAILABLE</span></div></div><div className="panel table-panel full-panel"><div className="panel-header"><div><h2>Available reports</h2><p>One downloadable report per completed scan</p></div><div className="report-total">{completedScans.length} reports</div></div>{completedScans.length ? <div className="table-scroll"><table><thead><tr><th>REPORT / PROJECT</th><th>FINDINGS</th><th>GENERATED</th><th>FORMAT</th><th /></tr></thead><tbody>{completedScans.map((scan) => <tr key={scan.id}><td><div className="report-name"><span className="report-file-icon"><FileText size={16} /></span><span><strong>{scan.filename} report</strong><small>{scan.project?.name || "Project"} · scan {scan.id.slice(-7)}</small></span></div></td><td>{scan.totalFindings}</td><td className="date-cell">{formatDate(scan.createdAt)}</td><td><span className="format-pill">.CSV</span></td><td><button className="download-button" onClick={() => onDownload(scan)}><ArrowDownToLine size={14} /> Download</button></td></tr>)}</tbody></table></div> : <EmptyState icon={FileText} title="No reports generated" text="A downloadable CSV report becomes available after a completed scan." />}</div><div className="report-disclaimer"><CircleHelp size={15} /><span>CSV contains static findings and ML predictions as separate columns. PDF exports are not included in this release.</span></div></>;
}

function SettingsPage({ user, darkMode, onToggleTheme }: { user: User; darkMode: boolean; onToggleTheme: () => void }) {
  return (
    <>
      <div className="welcome-row page-title-row"><div><div className="section-eyebrow">PREFERENCES</div><h1>Settings<span className="title-period">.</span></h1><p>Manage your personal workspace preferences.</p></div></div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="settings-heading"><div className="settings-icon"><Settings size={17} /></div><div><h2>Profile</h2><p>Your account information</p></div></div>
          <div className="settings-row"><div><strong>Name</strong><span>{user.name}</span></div><div className="profile-avatar large-avatar">{user.name.slice(0, 1).toUpperCase()}</div></div>
          <div className="settings-row"><div><strong>Email address</strong><span>{user.email}</span></div><span className="role-pill">Account active</span></div>
          <div className="settings-row"><div><strong>Access role</strong><span>{user.role === "ADMIN" ? "Administrator access" : "Standard workspace member"}</span></div><span className="role-pill">{user.role}</span></div>
        </section>
        <section className="panel settings-panel">
          <div className="settings-heading"><div className="settings-icon"><Sun size={17} /></div><div><h2>Appearance</h2><p>Personalize your dashboard</p></div></div>
          <div className="settings-row"><div><strong>Color theme</strong><span>Choose your preferred appearance</span></div><button className={`toggle-switch ${darkMode ? "toggle-on" : ""}`} onClick={onToggleTheme} aria-label="Toggle dark theme"><span /></button></div>
          <div className="integration-notice"><Github size={18} /><div><strong>GitHub integration</strong><span>Repository connection is not yet available. No GitHub token is stored by this release.</span></div><span className="coming-pill">COMING SOON</span></div>
        </section>
      </div>
      <ModelMetricsPanel />
      <div className="security-note"><ShieldCheck size={17} /><span>Your session uses an HTTP-only cookie and your password is hashed using bcrypt. Raw uploads are not retained, but short issue excerpts are stored with scan history and matched secrets are redacted.</span></div>
    </>
  );
}

function ModelMetricsPanel() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [metricsError, setMetricsError] = useState("");

  useEffect(() => {
    api.get<ModelMetrics>("/metrics/model")
      .then(({ data }) => setMetrics(data))
      .catch((requestError: unknown) => setMetricsError(errorMessage(requestError)));
  }, []);

  return <section className="panel metrics-panel"><div className="metrics-heading"><div><h2>Model evaluation</h2><p>Measured holdout metrics · not live scan accuracy</p></div>{metrics && <span className="model-version">{metrics.model_version}</span>}</div>{metricsError ? <div className="metrics-message">{metricsError}</div> : !metrics ? <div className="metrics-message"><span className="button-spinner" /> Loading measured evaluation…</div> : <><div className="metrics-source"><Sparkles size={14} /> {metrics.dataset_rows} authored synthetic examples <span>·</span> {metrics.evaluation}</div><div className="metrics-cards"><MetricCard title="Issue category classifier" metrics={metrics.category_classification} /><MetricCard title="Priority classifier" metrics={metrics.priority_classification} /></div><p className="metrics-caveat">These metrics are computed from the documented synthetic dataset and are only a pipeline demonstration—not a real-world performance claim.</p></>}</section>;
}

function MetricCard({ title, metrics }: { title: string; metrics: ClassifierMetrics }) {
  return <article className="metric-card"><h3>{title}</h3><div className="metric-values"><span>Accuracy <strong>{(metrics.accuracy * 100).toFixed(1)}%</strong></span><span>Precision <strong>{(metrics.precision_macro * 100).toFixed(1)}%</strong></span><span>Recall <strong>{(metrics.recall_macro * 100).toFixed(1)}%</strong></span><span>F1 <strong>{(metrics.f1_macro * 100).toFixed(1)}%</strong></span></div><details className="confusion-details"><summary>Confusion matrix <span>rows: actual · columns: predicted</span></summary><div className="matrix-wrap"><table className="matrix-table"><thead><tr><th>actual ↓</th>{metrics.labels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{metrics.confusion_matrix.map((row, index) => <tr key={metrics.labels[index]}><th>{metrics.labels[index]}</th>{row.map((count, column) => <td key={metrics.labels[column]}>{count}</td>)}</tr>)}</tbody></table></div></details></article>;
}

function StatusPill({ status }: { status: Scan["status"] }) {
  const failed = status === "FAILED";
  return <span className={`status-pill ${failed ? "status-failed" : status === "COMPLETED" ? "status-complete" : "status-running"}`}><i />{status[0] + status.slice(1).toLowerCase()}</span>;
}

function EmptyState({ icon: Icon, title, text, action, onAction }: {
  icon: typeof LayoutDashboard; title: string; text: string; action?: string; onAction?: () => void;
}) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={19} /></div><strong>{title}</strong><p>{text}</p>{action && onAction && <button className="button-secondary" onClick={onAction}>{action}<ArrowRight size={14} /></button>}</div>;
}

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export default App;
