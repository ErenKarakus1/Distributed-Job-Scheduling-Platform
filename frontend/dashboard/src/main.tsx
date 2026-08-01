import React from "react";
import { createRoot } from "react-dom/client";
import { createApiClient } from "./api.js";
import { AuditPanel, DataPanel, FilterBar, OverviewPanel, Pager, UserPanel, WorkerPanel } from "./components.js";
import { AuditFilterBar, JobCreateForm } from "./forms.js";
import { parseOptionalJson } from "./json.js";
import { AuthStrip, type DashboardView, Sidebar, Toolbar } from "./shell.js";
import type { AuditEvent, AuthResponse, AuthUser, NewJobFormState } from "./types.js";
import "./styles.css";

function App() {
  const [apiBaseUrl, setApiBaseUrl] = React.useState("http://localhost:3000");
  const [apiKey, setApiKey] = React.useState("");
  const [authToken, setAuthToken] = React.useState(() => localStorage.getItem("scheduler.jwt") ?? "");
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = React.useState<"login" | "register">("login");
  const [authForm, setAuthForm] = React.useState({
    email: "",
    name: "",
    password: "",
  });
  const [newJob, setNewJob] = React.useState<NewJobFormState>({
    name: "",
    type: "ONE_TIME",
    method: "POST",
    url: "",
    headers: "{\n  \"content-type\": \"application/json\"\n}",
    body: "{\n  \"message\": \"scheduled hello\"\n}",
    runAt: new Date(Date.now() + 60000).toISOString().slice(0, 16),
    cronExpression: "*/5 * * * *",
    timezone: "UTC",
    nextRunAt: new Date(Date.now() + 60000).toISOString().slice(0, 16),
    maxAttempts: 3,
    backoffType: "EXPONENTIAL",
    retryInitialDelayMs: 1000,
    retryMaxDelayMs: 60000,
    timeoutMs: 30000,
  });
  const [jobs, setJobs] = React.useState<unknown[]>([]);
  const [executions, setExecutions] = React.useState<unknown[]>([]);
  const [jobPage, setJobPage] = React.useState({ limit: 25, offset: 0, total: 0 });
  const [executionPage, setExecutionPage] = React.useState({ limit: 25, offset: 0, total: 0 });
  const [workerPage, setWorkerPage] = React.useState({ limit: 25, offset: 0, total: 0 });
  const [jobStatusFilter, setJobStatusFilter] = React.useState("");
  const [executionStatusFilter, setExecutionStatusFilter] = React.useState("");
  const [workers, setWorkers] = React.useState<unknown[]>([]);
  const [users, setUsers] = React.useState<AuthUser[]>([]);
  const [auditEvents, setAuditEvents] = React.useState<AuditEvent[]>([]);
  const [auditFilters, setAuditFilters] = React.useState({
    actorType: "",
    action: "",
    resourceType: "",
    resourceId: "",
    limit: 50,
  });
  const [metrics, setMetrics] = React.useState<Record<string, unknown>>({});
  const [health, setHealth] = React.useState<Record<string, unknown>>({});
  const [activeView, setActiveView] = React.useState<DashboardView>("overview");
  const [message, setMessage] = React.useState("Ready");
  const { authRequest, request } = React.useMemo(() => createApiClient({ apiBaseUrl, apiKey, authToken }), [apiBaseUrl, apiKey, authToken]);

  React.useEffect(() => {
    if (!authToken) {
      setAuthUser(null);
      return;
    }

    localStorage.setItem("scheduler.jwt", authToken);
    void loadCurrentUser(authToken);
  }, [authToken, apiBaseUrl]);

  async function loadCurrentUser(token = authToken) {
    try {
      const body = await authRequest<{ user: AuthUser }>("/auth/me", {}, token);
      setAuthUser(body.user);
    } catch {
      localStorage.removeItem("scheduler.jwt");
      setAuthToken("");
      setAuthUser(null);
    }
  }

  async function refreshJobs(page = jobPage) {
    setMessage("Loading jobs");
    const params = new URLSearchParams({
      limit: String(page.limit),
      offset: String(page.offset),
    });
    if (jobStatusFilter) params.set("status", jobStatusFilter);

    const body = await request<{ data: unknown[]; page: { limit: number; offset: number; total: number } }>(`/api/jobs?${params}`);
    setJobs(body.data);
    setJobPage(body.page);
    setMessage(`Loaded ${body.data.length} job(s)`);
  }

  async function refreshMetrics() {
    setMessage("Loading overview");
    const body = await request<Record<string, unknown>>("/api/metrics/overview");
    setMetrics(body);
    setMessage("Loaded overview");
  }

  async function refreshExecutions(page = executionPage) {
    setMessage("Loading executions");
    const params = new URLSearchParams({
      limit: String(page.limit),
      offset: String(page.offset),
    });
    if (executionStatusFilter) params.set("status", executionStatusFilter);

    const body = await request<{ data: unknown[]; page: { limit: number; offset: number; total: number } }>(`/api/executions?${params}`);
    setExecutions(body.data);
    setExecutionPage(body.page);
    setMessage(`Loaded ${body.data.length} execution(s)`);
  }

  async function refreshWorkers(page = workerPage) {
    setMessage("Loading workers");
    const params = new URLSearchParams({
      limit: String(page.limit),
      offset: String(page.offset),
    });
    const body = await request<{ data: unknown[]; page: { limit: number; offset: number; total: number } }>(`/api/workers?${params}`);
    setWorkers(body.data);
    setWorkerPage(body.page);
    setMessage(`Loaded ${body.data.length} worker(s)`);
  }

  async function refreshUsers() {
    setMessage("Loading users");
    const body = await authRequest<{ data: AuthUser[] }>("/internal/users");
    setUsers(body.data);
    setMessage(`Loaded ${body.data.length} user(s)`);
  }

  async function refreshAuditEvents() {
    setMessage("Loading audit events");
    const params = new URLSearchParams({
      limit: String(auditFilters.limit),
    });

    if (auditFilters.actorType) params.set("actorType", auditFilters.actorType);
    if (auditFilters.action) params.set("action", auditFilters.action);
    if (auditFilters.resourceType) params.set("resourceType", auditFilters.resourceType);
    if (auditFilters.resourceId) params.set("resourceId", auditFilters.resourceId);

    const body = await request<{ data: AuditEvent[] }>(`/api/audit-events?${params}`);
    setAuditEvents(body.data);
    setMessage(`Loaded ${body.data.length} audit event(s)`);
  }

  async function refreshHealth() {
    setMessage("Loading service health");
    const body = await request<Record<string, unknown>>("/health/services");
    setHealth(body);
    setMessage("Loaded service health");
  }

  async function refreshCurrentView() {
    try {
      if (activeView === "overview") await refreshMetrics();
      if (activeView === "jobs") await refreshJobs();
      if (activeView === "executions") await refreshExecutions();
      if (activeView === "workers") await refreshWorkers();
      if (activeView === "users") await refreshUsers();
      if (activeView === "audit") await refreshAuditEvents();
      if (activeView === "health") await refreshHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    }
  }

  async function createJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setMessage("Creating job");
      const isRecurring = newJob.type === "RECURRING";
      const headers = parseOptionalJson<Record<string, string>>(newJob.headers, "Headers");
      const body = parseOptionalJson<unknown>(newJob.body, "Body");

      await request("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          name: newJob.name,
          type: newJob.type,
          method: newJob.method,
          url: newJob.url,
          headers,
          body,
          timeoutMs: newJob.timeoutMs,
          maxAttempts: newJob.maxAttempts,
          backoffType: newJob.backoffType,
          retryInitialDelayMs: newJob.retryInitialDelayMs,
          retryMaxDelayMs: newJob.retryMaxDelayMs,
          runAt: isRecurring ? undefined : new Date(newJob.runAt).toISOString(),
          schedule: isRecurring
            ? {
                cronExpression: newJob.cronExpression,
                timezone: newJob.timezone,
                nextRunAt: new Date(newJob.nextRunAt).toISOString(),
              }
            : undefined,
        }),
      });
      setNewJob((current) => ({ ...current, name: "", url: "", body: "" }));
      await refreshJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create job failed");
    }
  }

  async function runJobAction(jobId: string, action: "run" | "pause" | "resume") {
    try {
      setMessage(`${action} job`);
      await request(`/api/jobs/${jobId}/${action}`, { method: "POST" });
      await refreshJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${action} failed`);
    }
  }

  async function runExecutionAction(executionId: string, action: "cancel") {
    try {
      setMessage(`${action} execution`);
      await request(`/api/executions/${executionId}/${action}`, { method: "POST" });
      await refreshExecutions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${action} failed`);
    }
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setMessage(authMode === "login" ? "Signing in" : "Creating user");
      const body = await authRequest<AuthResponse>(
        authMode === "login" ? "/auth/login" : "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email,
            name: authMode === "register" ? authForm.name : undefined,
            password: authForm.password,
          }),
        },
        "",
      );

      localStorage.setItem("scheduler.jwt", body.token);
      setAuthToken(body.token);
      setAuthUser(body.user);
      setAuthForm({ email: "", name: "", password: "" });
      setMessage(`Signed in as ${body.user.email}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Auth request failed");
    }
  }

  function signOut() {
    localStorage.removeItem("scheduler.jwt");
    setAuthToken("");
    setAuthUser(null);
    setMessage("Signed out");
  }

  async function updateUserRole(userId: string, role: "ADMIN" | "VIEWER") {
    try {
      setMessage("Updating user role");
      await authRequest(`/internal/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await refreshUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Role update failed");
    }
  }

  return (
    <main className="app-shell">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      <section className="workspace">
        <Toolbar apiBaseUrl={apiBaseUrl} apiKey={apiKey} onApiBaseUrlChange={setApiBaseUrl} onApiKeyChange={setApiKey} onRefresh={() => void refreshCurrentView()} />

        <AuthStrip
          authForm={authForm}
          authMode={authMode}
          authUser={authUser}
          onAuthFormChange={setAuthForm}
          onAuthModeChange={setAuthMode}
          onSignOut={signOut}
          onSubmit={(event) => void submitAuth(event)}
        />

        <div className="status-line">{message}</div>

        {activeView === "overview" && <OverviewPanel metrics={metrics} />}

        {activeView === "jobs" && (
          <>
            <JobCreateForm job={newJob} onChange={setNewJob} onSubmit={(event) => void createJob(event)} />
            <FilterBar
              label="Job status"
              value={jobStatusFilter}
              options={["ACTIVE", "PAUSED", "DELETED"]}
              onChange={setJobStatusFilter}
              onApply={() => {
                const nextPage = { ...jobPage, offset: 0 };
                setJobPage(nextPage);
                void refreshJobs(nextPage);
              }}
            />
            <DataPanel title="Jobs" rows={jobs} emptyText="No jobs loaded" onJobAction={runJobAction} />
            <Pager page={jobPage} onChange={setJobPage} onApply={(page) => void refreshJobs(page)} />
          </>
        )}

        {activeView === "executions" && (
          <>
            <FilterBar
              label="Execution status"
              value={executionStatusFilter}
              options={["PENDING", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "RETRY_SCHEDULED", "STALLED", "CANCELED"]}
              onChange={setExecutionStatusFilter}
              onApply={() => {
                const nextPage = { ...executionPage, offset: 0 };
                setExecutionPage(nextPage);
                void refreshExecutions(nextPage);
              }}
            />
            <DataPanel title="Executions" rows={executions} emptyText="No executions loaded" expandableAttempts onExecutionAction={runExecutionAction} />
            <Pager page={executionPage} onChange={setExecutionPage} onApply={(page) => void refreshExecutions(page)} />
          </>
        )}

        {activeView === "workers" && (
          <>
            <WorkerPanel rows={workers} />
            <Pager page={workerPage} onChange={setWorkerPage} onApply={(page) => void refreshWorkers(page)} />
          </>
        )}

        {activeView === "users" && <UserPanel rows={users} onRoleChange={updateUserRole} />}

        {activeView === "audit" && (
          <>
            <AuditFilterBar filters={auditFilters} onChange={setAuditFilters} onApply={() => void refreshAuditEvents()} />
            <AuditPanel rows={auditEvents} />
          </>
        )}

        {activeView === "health" && (
          <section className="panel">
            <h2>Service Health</h2>
            <pre>{JSON.stringify(health, null, 2)}</pre>
          </section>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
