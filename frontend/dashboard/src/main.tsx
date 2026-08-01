import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  const [apiBaseUrl, setApiBaseUrl] = React.useState("http://localhost:3000");
  const [apiKey, setApiKey] = React.useState("");
  const [jobs, setJobs] = React.useState<unknown[]>([]);
  const [executions, setExecutions] = React.useState<unknown[]>([]);
  const [health, setHealth] = React.useState<Record<string, unknown>>({});
  const [activeView, setActiveView] = React.useState<"jobs" | "executions" | "health">("jobs");
  const [message, setMessage] = React.useState("Ready");

  async function request<T>(path: string) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: apiKey ? { "x-api-key": apiKey } : {},
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

  async function refreshExecutions() {
    setMessage("Loading executions");
    const body = await request<{ data: unknown[] }>("/api/executions");
    setExecutions(body.data);
    setMessage(`Loaded ${body.data.length} execution(s)`);
  }

  async function refreshHealth() {
    setMessage("Loading service health");
    const body = await request<Record<string, unknown>>("/health/services");
    setHealth(body);
    setMessage("Loaded service health");
  }

  async function refreshCurrentView() {
    try {
      if (activeView === "jobs") await refreshJobs();
      if (activeView === "executions") await refreshExecutions();
      if (activeView === "health") await refreshHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
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
          <button className={activeView === "jobs" ? "active" : ""} onClick={() => setActiveView("jobs")}>
            Jobs
          </button>
          <button className={activeView === "executions" ? "active" : ""} onClick={() => setActiveView("executions")}>
            Executions
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

        {activeView === "jobs" && (
          <DataPanel title="Jobs" rows={jobs} emptyText="No jobs loaded" />
        )}

        {activeView === "executions" && (
          <DataPanel title="Executions" rows={executions} emptyText="No executions loaded" />
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

function DataPanel(props: { title: string; rows: unknown[]; emptyText: string }) {
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
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => {
                const item = row as Record<string, unknown>;
                const job = item.job as Record<string, unknown> | undefined;

                return (
                  <tr key={String(item.id ?? index)}>
                    <td>{String(item.id ?? "")}</td>
                    <td>{String(item.status ?? "")}</td>
                    <td>{String(item.name ?? job?.name ?? item.jobId ?? "")}</td>
                    <td>{String(item.createdAt ?? "")}</td>
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
