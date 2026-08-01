import React from "react";
import type { ExecutionAttempt, ExecutionRow, JobRow } from "../types.js";

type DataPanelRow = JobRow | ExecutionRow;

export function DataPanel(props: {
  title: string;
  rows: DataPanelRow[];
  emptyText: string;
  onJobAction?: (jobId: string, action: "run" | "pause" | "resume" | "edit" | "delete") => void;
  onExecutionAction?: (executionId: string, action: "cancel" | "retry") => void;
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
                const item = row as DataPanelRow;
                const execution = item as ExecutionRow;
                const attempts = execution.attempts ?? [];
                const displayName = "name" in item ? item.name : execution.job?.name ?? execution.jobId ?? "";
                const displayDate = item.createdAt ?? execution.startedAt ?? "";
                const rowId = item.id ?? String(index);
                const canRetryExecution = ["FAILED", "CANCELED"].includes(String(execution.status));

                return (
                  <React.Fragment key={rowId}>
                    <tr>
                      <td>{item.id}</td>
                      <td>{item.status}</td>
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
                                <button onClick={() => props.onJobAction?.(item.id, "run")}>Run</button>
                                <button onClick={() => props.onJobAction?.(item.id, "edit")}>Edit</button>
                                <button onClick={() => props.onJobAction?.(item.id, "pause")}>Pause</button>
                                <button onClick={() => props.onJobAction?.(item.id, "resume")}>Resume</button>
                                <button onClick={() => props.onJobAction?.(item.id, "delete")}>Delete</button>
                              </>
                            )}
                            {props.onExecutionAction && (
                              <>
                                <button onClick={() => props.onExecutionAction?.(item.id, "cancel")}>Cancel</button>
                                {canRetryExecution && <button onClick={() => props.onExecutionAction?.(item.id, "retry")}>Retry</button>}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {props.expandableAttempts && expandedId === rowId && (
                      <tr>
                        <td colSpan={5}>
                          <ExecutionDetails execution={execution} />
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

function ExecutionDetails(props: { execution: ExecutionRow }) {
  const { execution } = props;
  const details = [
    ["Execution ID", execution.id],
    ["Job ID", execution.jobId ?? execution.job?.id],
    ["Scheduled", execution.scheduledFor],
    ["Started", execution.startedAt],
    ["Finished", execution.finishedAt],
    ["Next attempt", execution.nextAttemptAt],
    ["Locked worker", execution.lockedByWorkerId],
    ["Last heartbeat", execution.lastHeartbeatAt],
    ["Attempt count", execution.attemptCount],
  ];

  return (
    <div className="execution-detail">
      <dl>
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === undefined || value === null || value === "" ? "-" : String(value)}</dd>
          </div>
        ))}
      </dl>
      <AttemptDetails attempts={execution.attempts ?? []} />
    </div>
  );
}

function AttemptDetails(props: { attempts: ExecutionAttempt[] }) {
  if (props.attempts.length === 0) {
    return <p className="empty-state">No attempts recorded</p>;
  }

  return (
    <div className="attempt-list">
      {props.attempts.map((attempt, index) => {
        const errorMessage = attempt.errorMessage ? String(attempt.errorMessage) : undefined;
        const responseBodyPreview = attempt.responseBodyPreview ? String(attempt.responseBodyPreview) : undefined;

        return (
          <article className="attempt-card" key={String(attempt.id ?? index)}>
            <div>
              <strong>Attempt {String(attempt.attemptNumber ?? index + 1)}</strong>
              <span>{String(attempt.status ?? "")}</span>
              <span>{attempt.httpStatusCode ? `HTTP ${String(attempt.httpStatusCode)}` : "No status code"}</span>
              <span>{attempt.durationMs ? `${String(attempt.durationMs)}ms` : "No duration"}</span>
            </div>
            {errorMessage && <pre>{errorMessage}</pre>}
            {responseBodyPreview && <pre>{responseBodyPreview}</pre>}
          </article>
        );
      })}
    </div>
  );
}
