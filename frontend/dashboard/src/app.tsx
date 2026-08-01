import React from "react";
import { createApiClient } from "./api.js";
import { AUTH_TOKEN_STORAGE_KEY, createDefaultAuditFilters, createDefaultJobForm, createEmptyAuthForm, DEFAULT_PAGE_STATE } from "./dashboard-state.js";
import { createAuditParams, createJobRequestBody, createPageParams } from "./dashboard-requests.js";
import { AuthStrip, type DashboardView, Sidebar, Toolbar } from "./shell.js";
import type { ApiKeyRow, AuditEvent, AuthResponse, AuthUser, CreatedApiKey, ExecutionRow, JobRow, MetricsOverview, NewJobFormState, PageResponse, ServiceHealthMap, WorkerRow } from "./types.js";
import { DashboardViews } from "./views.js";

export function App() {
  const [apiBaseUrl, setApiBaseUrl] = React.useState("http://localhost:3000");
  const [apiKey, setApiKey] = React.useState("");
  const [authToken, setAuthToken] = React.useState(() => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? "");
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = React.useState<"login" | "register">("login");
  const [authForm, setAuthForm] = React.useState(createEmptyAuthForm);
  const [newJob, setNewJob] = React.useState<NewJobFormState>(createDefaultJobForm);
  const [jobs, setJobs] = React.useState<JobRow[]>([]);
  const [executions, setExecutions] = React.useState<ExecutionRow[]>([]);
  const [jobPage, setJobPage] = React.useState(DEFAULT_PAGE_STATE);
  const [executionPage, setExecutionPage] = React.useState(DEFAULT_PAGE_STATE);
  const [workerPage, setWorkerPage] = React.useState(DEFAULT_PAGE_STATE);
  const [jobStatusFilter, setJobStatusFilter] = React.useState("");
  const [executionStatusFilter, setExecutionStatusFilter] = React.useState("");
  const [workers, setWorkers] = React.useState<WorkerRow[]>([]);
  const [users, setUsers] = React.useState<AuthUser[]>([]);
  const [apiKeys, setApiKeys] = React.useState<ApiKeyRow[]>([]);
  const [apiKeyName, setApiKeyName] = React.useState("");
  const [createdApiKey, setCreatedApiKey] = React.useState<CreatedApiKey | null>(null);
  const [auditEvents, setAuditEvents] = React.useState<AuditEvent[]>([]);
  const [auditFilters, setAuditFilters] = React.useState(createDefaultAuditFilters);
  const [metrics, setMetrics] = React.useState<MetricsOverview>({});
  const [health, setHealth] = React.useState<ServiceHealthMap>({});
  const [activeView, setActiveView] = React.useState<DashboardView>("overview");
  const [message, setMessage] = React.useState("Ready");
  const { authRequest, request } = React.useMemo(() => createApiClient({ apiBaseUrl, apiKey, authToken }), [apiBaseUrl, apiKey, authToken]);

  React.useEffect(() => {
    if (!authToken) {
      setAuthUser(null);
      return;
    }

    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
    void loadCurrentUser(authToken);
  }, [authToken, apiBaseUrl]);

  async function loadCurrentUser(token = authToken) {
    try {
      const body = await authRequest<{ user: AuthUser }>("/auth/me", {}, token);
      setAuthUser(body.user);
    } catch {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      setAuthToken("");
      setAuthUser(null);
    }
  }

  async function refreshJobs(page = jobPage) {
    setMessage("Loading jobs");
    const params = createPageParams(page, jobStatusFilter);

    const body = await request<PageResponse<JobRow>>(`/api/jobs?${params}`);
    setJobs(body.data);
    setJobPage(body.page);
    setMessage(`Loaded ${body.data.length} job(s)`);
  }

  async function refreshMetrics() {
    setMessage("Loading overview");
    const body = await request<MetricsOverview>("/api/metrics/overview");
    setMetrics(body);
    setMessage("Loaded overview");
  }

  async function refreshExecutions(page = executionPage) {
    setMessage("Loading executions");
    const params = createPageParams(page, executionStatusFilter);

    const body = await request<PageResponse<ExecutionRow>>(`/api/executions?${params}`);
    setExecutions(body.data);
    setExecutionPage(body.page);
    setMessage(`Loaded ${body.data.length} execution(s)`);
  }

  async function refreshWorkers(page = workerPage) {
    setMessage("Loading workers");
    const params = createPageParams(page);
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

  async function refreshApiKeys() {
    setMessage("Loading API keys");
    const body = await authRequest<{ data: ApiKeyRow[] }>("/internal/api-keys");
    setApiKeys(body.data);
    setMessage(`Loaded ${body.data.length} API key(s)`);
  }

  async function refreshAuditEvents() {
    setMessage("Loading audit events");
    const params = createAuditParams(auditFilters);

    const body = await request<{ data: AuditEvent[] }>(`/api/audit-events?${params}`);
    setAuditEvents(body.data);
    setMessage(`Loaded ${body.data.length} audit event(s)`);
  }

  async function refreshHealth() {
    setMessage("Loading service health");
    const body = await request<ServiceHealthMap>("/health/services");
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
      if (activeView === "apiKeys") await refreshApiKeys();
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

      await request("/api/jobs", {
        method: "POST",
        body: JSON.stringify(createJobRequestBody(newJob)),
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

      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, body.token);
      setAuthToken(body.token);
      setAuthUser(body.user);
      setAuthForm(createEmptyAuthForm());
      setMessage(`Signed in as ${body.user.email}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Auth request failed");
    }
  }

  async function createApiKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setMessage("Creating API key");
      const body = await authRequest<CreatedApiKey>("/internal/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: apiKeyName }),
      });
      setCreatedApiKey(body);
      setApiKeyName("");
      await refreshApiKeys();
      setMessage("Created API key");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "API key creation failed");
    }
  }

  async function revokeApiKey(apiKeyId: string) {
    try {
      setMessage("Revoking API key");
      await authRequest(`/internal/api-keys/${apiKeyId}`, { method: "DELETE" });
      if (createdApiKey?.id === apiKeyId) {
        setCreatedApiKey(null);
      }
      await refreshApiKeys();
      setMessage("Revoked API key");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "API key revoke failed");
    }
  }

  function signOut() {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
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
          apiKeyName={apiKeyName}
          apiKeys={apiKeys}
          auditEvents={auditEvents}
          auditFilters={auditFilters}
          createdApiKey={createdApiKey}
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
          onApiKeyNameChange={setApiKeyName}
          onCreateApiKey={(event) => void createApiKey(event)}
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
          onRevokeApiKey={revokeApiKey}
          onWorkerPageChange={setWorkerPage}
        />
      </section>
    </main>
  );
}
