import React from "react";
import { createApiClient } from "./api.js";
import { parseOptionalJson } from "./json.js";
import { AuthStrip, type DashboardView, Sidebar, Toolbar } from "./shell.js";
import type { AuditEvent, AuthResponse, AuthUser, ExecutionRow, JobRow, NewJobFormState, PageResponse, WorkerRow } from "./types.js";
import { DashboardViews } from "./views.js";

export function App() {
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
  const [jobs, setJobs] = React.useState<JobRow[]>([]);
  const [executions, setExecutions] = React.useState<ExecutionRow[]>([]);
  const [jobPage, setJobPage] = React.useState({ limit: 25, offset: 0, total: 0 });
  const [executionPage, setExecutionPage] = React.useState({ limit: 25, offset: 0, total: 0 });
  const [workerPage, setWorkerPage] = React.useState({ limit: 25, offset: 0, total: 0 });
  const [jobStatusFilter, setJobStatusFilter] = React.useState("");
  const [executionStatusFilter, setExecutionStatusFilter] = React.useState("");
  const [workers, setWorkers] = React.useState<WorkerRow[]>([]);
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

    const body = await request<PageResponse<JobRow>>(`/api/jobs?${params}`);
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

    const body = await request<PageResponse<ExecutionRow>>(`/api/executions?${params}`);
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
    const body = await request<PageResponse<WorkerRow>>(`/api/workers?${params}`);
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

        <DashboardViews
          activeView={activeView}
          auditEvents={auditEvents}
          auditFilters={auditFilters}
          executionPage={executionPage}
          executionStatusFilter={executionStatusFilter}
          executions={executions}
          health={health}
          jobPage={jobPage}
          jobStatusFilter={jobStatusFilter}
          jobs={jobs}
          metrics={metrics}
          newJob={newJob}
          users={users}
          workerPage={workerPage}
          workers={workers}
          onAuditFiltersChange={setAuditFilters}
          onCreateJob={(event) => void createJob(event)}
          onExecutionAction={runExecutionAction}
          onExecutionPageChange={setExecutionPage}
          onExecutionStatusFilterChange={setExecutionStatusFilter}
          onJobAction={runJobAction}
          onJobChange={setNewJob}
          onJobPageChange={setJobPage}
          onJobStatusFilterChange={setJobStatusFilter}
          onRefreshAuditEvents={() => void refreshAuditEvents()}
          onRefreshExecutions={(page) => void refreshExecutions(page)}
          onRefreshJobs={(page) => void refreshJobs(page)}
          onRefreshWorkers={(page) => void refreshWorkers(page)}
          onUserRoleChange={updateUserRole}
          onWorkerPageChange={setWorkerPage}
        />
      </section>
    </main>
  );
}
