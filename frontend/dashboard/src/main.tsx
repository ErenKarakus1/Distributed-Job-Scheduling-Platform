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
    runAt: new Date(Date.now() + 60000).toISOString().slice(0, 16),
    cronExpression: "*/5 * * * *",
    timezone: "UTC",
    nextRunAt: new Date(Date.now() + 60000).toISOString().slice(0, 16),
  });
  const [jobs, setJobs] = React.useState<unknown[]>([]);
  const [executions, setExecutions] = React.useState<unknown[]>([]);
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

  async function refreshJobs() {
    setMessage("Loading jobs");
    const body = await request<{ data: unknown[] }>("/api/jobs");
    setJobs(body.data);
    setMessage(`Loaded ${body.data.length} job(s)`);
  }

  async function refreshMetrics() {
    setMessage("Loading overview");
    const body = await request<Record<string, unknown>>("/api/metrics/overview");
    setMetrics(body);
    setMessage("Loaded overview");
  }

  async function refreshExecutions() {
    setMessage("Loading executions");
    const body = await request<{ data: unknown[] }>("/api/executions");
    setExecutions(body.data);
    setMessage(`Loaded ${body.data.length} execution(s)`);
  }

  async function refreshWorkers() {
    setMessage("Loading workers");
    const body = await request<{ data: unknown[] }>("/api/workers");
    setWorkers(body.data);
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

      await request("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          name: newJob.name,
          type: newJob.type,
          method: newJob.method,
          url: newJob.url,
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
      setNewJob((current) => ({ ...current, name: "", url: "" }));
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
                <button type="submit">Create</button>
              </form>
            </section>
            <DataPanel title="Jobs" rows={jobs} emptyText="No jobs loaded" onJobAction={runJobAction} />
          </>
        )}

        {activeView === "executions" && (
          <DataPanel title="Executions" rows={executions} emptyText="No executions loaded" />
        )}

        {activeView === "workers" && (
          <DataPanel title="Workers" rows={workers} emptyText="No workers loaded" />
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
}) {
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
                {props.onJobAction && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => {
                const item = row as Record<string, unknown>;
                const job = item.job as Record<string, unknown> | undefined;
                const displayName = item.name ?? item.serviceInstanceId ?? job?.name ?? item.jobId ?? "";
                const displayDate = item.createdAt ?? item.lastHeartbeatAt ?? item.startedAt ?? "";

                return (
                  <tr key={String(item.id ?? index)}>
                    <td>{String(item.id ?? "")}</td>
                    <td>{String(item.status ?? "")}</td>
                    <td>{String(displayName)}</td>
                    <td>{String(displayDate)}</td>
                    {props.onJobAction && (
                      <td>
                        <div className="row-actions">
                          <button onClick={() => props.onJobAction?.(String(item.id), "run")}>Run</button>
                          <button onClick={() => props.onJobAction?.(String(item.id), "pause")}>Pause</button>
                          <button onClick={() => props.onJobAction?.(String(item.id), "resume")}>Resume</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
