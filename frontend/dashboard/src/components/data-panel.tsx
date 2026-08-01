import React from "react";

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
