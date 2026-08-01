import React from "react";
import type { AuditEvent, AuthUser, PageState } from "./types.js";

export function Pager(props: {
  page: PageState;
  onChange: (page: PageState) => void;
  onApply: (page: PageState) => void;
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

export function FilterBar(props: {
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

export function OverviewPanel(props: { metrics: Record<string, unknown> }) {
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

export function WorkerPanel(props: { rows: unknown[] }) {
  return (
    <section className="panel">
      <h2>Workers</h2>
      {props.rows.length === 0 ? (
        <p className="empty-state">No workers loaded</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instance</th>
                <th>Status</th>
                <th>Active</th>
                <th>Current execution</th>
                <th>Last heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => {
                const worker = row as Record<string, unknown>;

                return (
                  <tr key={String(worker.id ?? index)}>
                    <td>{String(worker.serviceInstanceId ?? worker.id ?? "")}</td>
                    <td>
                      <span className={`status-pill ${String(worker.status ?? "").toLowerCase()}`}>{String(worker.status ?? "")}</span>
                    </td>
                    <td>{String(worker.activeExecutionCount ?? 0)}</td>
                    <td>{String(worker.currentExecutionId ?? "-")}</td>
                    <td>{String(worker.lastHeartbeatAt ?? "")}</td>
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

export function UserPanel(props: { rows: AuthUser[]; onRoleChange: (userId: string, role: "ADMIN" | "VIEWER") => void }) {
  return (
    <section className="panel">
      <h2>Users</h2>
      {props.rows.length === 0 ? (
        <p className="empty-state">No users loaded</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.name}</td>
                  <td>
                    <select className="inline-select" value={user.role} onChange={(event) => props.onRoleChange(user.id, event.target.value as "ADMIN" | "VIEWER")}>
                      <option value="ADMIN">ADMIN</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </td>
                  <td>{user.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AuditPanel(props: { rows: AuditEvent[] }) {
  return (
    <section className="panel">
      <h2>Audit Events</h2>
      {props.rows.length === 0 ? (
        <p className="empty-state">No audit events loaded</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Request</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((event) => (
                <tr key={event.id}>
                  <td>{event.createdAt}</td>
                  <td>{event.actorLabel ?? event.actorType}</td>
                  <td>{event.action}</td>
                  <td>{event.resourceId ? `${event.resourceType}:${event.resourceId}` : event.resourceType}</td>
                  <td>{event.requestId ?? "-"}</td>
                  <td className="metadata-cell">{event.metadata ? JSON.stringify(event.metadata) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DataPanel(props: {
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
