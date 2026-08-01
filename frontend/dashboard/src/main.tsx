import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  const [apiBaseUrl, setApiBaseUrl] = React.useState("http://localhost:3000");
  const [apiKey, setApiKey] = React.useState("");
  const [newJob, setNewJob] = React.useState({
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
  const [metrics, setMetrics] = React.useState<Record<string, unknown>>({});
  const [health, setHealth] = React.useState<Record<string, unknown>>({});
  const [activeView, setActiveView] = React.useState<"overview" | "jobs" | "executions" | "workers" | "health">("overview");
  const [message, setMessage] = React.useState("Ready");

  async function request<T>(path: string, options: RequestInit = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
    });

    const body = (await response.json()) as T;

    if (!response.ok) {
      throw new Error(JSON.stringify(body));
    }

    return body;
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Distributed</p>
          <h1>Job Scheduler</h1>
        </div>

        <nav className="nav-tabs" aria-label="Dashboard views">
          <button className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")}>
            Overview
          </button>
          <button className={activeView === "jobs" ? "active" : ""} onClick={() => setActiveView("jobs")}>
            Jobs
          </button>
          <button className={activeView === "executions" ? "active" : ""} onClick={() => setActiveView("executions")}>
            Executions
          </button>
          <button className={activeView === "workers" ? "active" : ""} onClick={() => setActiveView("workers")}>
            Workers
          </button>
          <button className={activeView === "health" ? "active" : ""} onClick={() => setActiveView("health")}>
            Health
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="toolbar">
          <label>
            Gateway
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
          </label>
          <label>
            API key
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" />
          </label>
          <button onClick={() => void refreshCurrentView()}>Refresh</button>
        </header>

        <div className="status-line">{message}</div>

        {activeView === "overview" && <OverviewPanel metrics={metrics} />}

        {activeView === "jobs" && (
          <>
            <section className="panel create-panel">
              <h2>Create Job</h2>
              <form className="job-form" onSubmit={(event) => void createJob(event)}>
                <label>
                  Name
                  <input value={newJob.name} onChange={(event) => setNewJob({ ...newJob, name: event.target.value })} required />
                </label>
                <label>
                  Type
                  <select value={newJob.type} onChange={(event) => setNewJob({ ...newJob, type: event.target.value })}>
                    <option value="ONE_TIME">One-time</option>
                    <option value="RECURRING">Recurring</option>
                  </select>
                </label>
                <label>
                  Method
                  <select value={newJob.method} onChange={(event) => setNewJob({ ...newJob, method: event.target.value })}>
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                    <option>PATCH</option>
                    <option>DELETE</option>
                  </select>
                </label>
                <label>
                  URL
                  <input value={newJob.url} onChange={(event) => setNewJob({ ...newJob, url: event.target.value })} required />
                </label>
                <label className="wide-field">
                  Headers JSON
                  <textarea value={newJob.headers} onChange={(event) => setNewJob({ ...newJob, headers: event.target.value })} />
                </label>
                <label className="wide-field">
                  Body JSON
                  <textarea value={newJob.body} onChange={(event) => setNewJob({ ...newJob, body: event.target.value })} />
                </label>
                {newJob.type === "ONE_TIME" ? (
                  <label>
                    Run at
                    <input
                      type="datetime-local"
                      value={newJob.runAt}
                      onChange={(event) => setNewJob({ ...newJob, runAt: event.target.value })}
                      required
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      Cron
                      <input
                        value={newJob.cronExpression}
                        onChange={(event) => setNewJob({ ...newJob, cronExpression: event.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Timezone
                      <input value={newJob.timezone} onChange={(event) => setNewJob({ ...newJob, timezone: event.target.value })} required />
                    </label>
                    <label>
                      Next run
                      <input
                        type="datetime-local"
                        value={newJob.nextRunAt}
                        onChange={(event) => setNewJob({ ...newJob, nextRunAt: event.target.value })}
                        required
                      />
                    </label>
                  </>
                )}
                <label>
                  Attempts
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newJob.maxAttempts}
                    onChange={(event) => setNewJob({ ...newJob, maxAttempts: Number(event.target.value) })}
                    required
                  />
                </label>
                <label>
                  Backoff
                  <select value={newJob.backoffType} onChange={(event) => setNewJob({ ...newJob, backoffType: event.target.value })}>
                    <option value="EXPONENTIAL">Exponential</option>
                    <option value="FIXED">Fixed</option>
                  </select>
                </label>
                <label>
                  Initial delay
                  <input
                    type="number"
                    min="0"
                    max="3600000"
                    value={newJob.retryInitialDelayMs}
                    onChange={(event) => setNewJob({ ...newJob, retryInitialDelayMs: Number(event.target.value) })}
                    required
                  />
                </label>
                <label>
                  Max delay
                  <input
                    type="number"
                    min="0"
                    max="86400000"
                    value={newJob.retryMaxDelayMs}
                    onChange={(event) => setNewJob({ ...newJob, retryMaxDelayMs: Number(event.target.value) })}
                    required
                  />
                </label>
                <label>
                  Timeout
                  <input
                    type="number"
                    min="100"
                    max="300000"
                    value={newJob.timeoutMs}
                    onChange={(event) => setNewJob({ ...newJob, timeoutMs: Number(event.target.value) })}
                    required
                  />
                </label>
                <button type="submit">Create</button>
              </form>
            </section>
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
            <DataPanel title="Workers" rows={workers} emptyText="No workers loaded" />
            <Pager page={workerPage} onChange={setWorkerPage} onApply={(page) => void refreshWorkers(page)} />
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

function parseOptionalJson<T>(value: string, label: string): T | undefined {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function Pager(props: {
  page: { limit: number; offset: number; total: number };
  onChange: (page: { limit: number; offset: number; total: number }) => void;
  onApply: (page: { limit: number; offset: number; total: number }) => void;
}) {
  const currentEnd = Math.min(props.page.offset + props.page.limit, props.page.total);
  const canGoBack = props.page.offset > 0;
  const canGoNext = props.page.offset + props.page.limit < props.page.total;

  return (
    <section className="pager">
      <span>
        {props.page.total === 0 ? "0" : props.page.offset + 1}-{currentEnd} of {props.page.total}
      </span>
      <button
        disabled={!canGoBack}
        onClick={() => {
          const nextPage = { ...props.page, offset: Math.max(props.page.offset - props.page.limit, 0) };
          props.onChange(nextPage);
          props.onApply(nextPage);
        }}
      >
        Prev
      </button>
      <button
        disabled={!canGoNext}
        onClick={() => {
          const nextPage = { ...props.page, offset: props.page.offset + props.page.limit };
          props.onChange(nextPage);
          props.onApply(nextPage);
        }}
      >
        Next
      </button>
    </section>
  );
}

function FilterBar(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <section className="filter-bar">
      <label>
        {props.label}
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="">All</option>
          {props.options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button onClick={props.onApply}>Apply</button>
    </section>
  );
}

function OverviewPanel(props: { metrics: Record<string, unknown> }) {
  const jobs = (props.metrics.jobs ?? {}) as Record<string, unknown>;
  const executions = (props.metrics.executions ?? {}) as Record<string, unknown>;
  const workers = (props.metrics.workers ?? {}) as Record<string, unknown>;

  const cards: Array<[string, unknown]> = [
    ["Active jobs", jobs.active],
    ["Paused jobs", jobs.paused],
    ["Queued", executions.queued],
    ["Running", executions.running],
    ["Retrying", executions.retryScheduled],
    ["Failed", executions.failed],
    ["Succeeded", executions.succeeded],
    ["Active workers", workers.active],
  ];

  return (
    <section className="metric-grid" aria-label="Platform overview">
      {cards.map(([label, value]) => (
        <article className="metric-card" key={label}>
          <span>{label}</span>
          <strong>{String(value ?? "-")}</strong>
        </article>
      ))}
    </section>
  );
}

function DataPanel(props: {
  title: string;
  rows: unknown[];
  emptyText: string;
  onJobAction?: (jobId: string, action: "run" | "pause" | "resume") => void;
  onExecutionAction?: (executionId: string, action: "cancel") => void;
  expandableAttempts?: boolean;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <section className="panel">
      <h2>{props.title}</h2>
      {props.rows.length === 0 ? (
        <p className="empty-state">{props.emptyText}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Name / Job</th>
                <th>Created</th>
                {props.expandableAttempts && <th>Attempts</th>}
                {(props.onJobAction || props.onExecutionAction) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => {
                const item = row as Record<string, unknown>;
                const job = item.job as Record<string, unknown> | undefined;
                const attempts = Array.isArray(item.attempts) ? item.attempts : [];
                const displayName = item.name ?? item.serviceInstanceId ?? job?.name ?? item.jobId ?? "";
                const displayDate = item.createdAt ?? item.lastHeartbeatAt ?? item.startedAt ?? "";
                const rowId = String(item.id ?? index);

                return (
                  <React.Fragment key={rowId}>
                    <tr>
                      <td>{String(item.id ?? "")}</td>
                      <td>{String(item.status ?? "")}</td>
                      <td>{String(displayName)}</td>
                      <td>{String(displayDate)}</td>
                      {props.expandableAttempts && (
                        <td>
                          <button className="link-button" onClick={() => setExpandedId(expandedId === rowId ? null : rowId)}>
                            {attempts.length} attempt{attempts.length === 1 ? "" : "s"}
                          </button>
                        </td>
                      )}
                      {(props.onJobAction || props.onExecutionAction) && (
                        <td>
                          <div className="row-actions">
                            {props.onJobAction && (
                              <>
                                <button onClick={() => props.onJobAction?.(String(item.id), "run")}>Run</button>
                                <button onClick={() => props.onJobAction?.(String(item.id), "pause")}>Pause</button>
                                <button onClick={() => props.onJobAction?.(String(item.id), "resume")}>Resume</button>
                              </>
                            )}
                            {props.onExecutionAction && <button onClick={() => props.onExecutionAction?.(String(item.id), "cancel")}>Cancel</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                    {props.expandableAttempts && expandedId === rowId && (
                      <tr>
                        <td colSpan={5}>
                          <AttemptDetails attempts={attempts} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AttemptDetails(props: { attempts: unknown[] }) {
  if (props.attempts.length === 0) {
    return <p className="empty-state">No attempts recorded</p>;
  }

  return (
    <div className="attempt-list">
      {props.attempts.map((attempt, index) => {
        const item = attempt as Record<string, unknown>;
        const errorMessage = item.errorMessage ? String(item.errorMessage) : undefined;
        const responseBodyPreview = item.responseBodyPreview ? String(item.responseBodyPreview) : undefined;

        return (
          <article className="attempt-card" key={String(item.id ?? index)}>
            <div>
              <strong>Attempt {String(item.attemptNumber ?? index + 1)}</strong>
              <span>{String(item.status ?? "")}</span>
              <span>{item.httpStatusCode ? `HTTP ${String(item.httpStatusCode)}` : "No status code"}</span>
              <span>{item.durationMs ? `${String(item.durationMs)}ms` : "No duration"}</span>
            </div>
            {errorMessage && <pre>{errorMessage}</pre>}
            {responseBodyPreview && <pre>{responseBodyPreview}</pre>}
          </article>
        );
      })}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
