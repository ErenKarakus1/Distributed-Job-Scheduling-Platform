import React from "react";
import type { DeadLetterRow, ExecutionAttempt, ExecutionRow, JobRow } from "../types.js";

type DataPanelRow = JobRow | ExecutionRow;
type JobAction = "run" | "pause" | "resume" | "edit" | "delete";
type RowAction = {
  action: JobAction;
  className?: string;
  label: string;
};

const terminalExecutionStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

export function canCancelExecution(status: unknown) {
  return !terminalExecutionStatuses.has(String(status));
}

export function canRetryExecution(status: unknown, jobStatus?: unknown) {
  return (
    ["FAILED", "CANCELED"].includes(String(status)) &&
    String(jobStatus) !== "DELETED"
  );
}

export function canRequeueDeadLetter(message: DeadLetterRow) {
  return (
    Boolean(message.executionId && message.execution) &&
    message.execution?.job?.status !== "DELETED"
  );
}

export function getJobRowActions(status: unknown): RowAction[] {
  const normalizedStatus = String(status);

  if (normalizedStatus === "DELETED") {
    return [];
  }

  const actions: RowAction[] = [
    { action: "edit", label: "Edit" },
    { action: "delete", className: "danger-button", label: "Delete" },
  ];

  if (normalizedStatus === "PAUSED") {
    return [
      { action: "resume", className: "primary-button", label: "Resume" },
      ...actions,
    ];
  }

  return [
    { action: "run", className: "primary-button", label: "Run" },
    { action: "pause", label: "Pause" },
    ...actions,
  ];
}

export function DataPanel(props: {
  title: string;
  rows: DataPanelRow[];
  emptyText: string;
  onJobAction?: (jobId: string, action: JobAction) => void;
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
                {(props.onJobAction || props.onExecutionAction) && (
                  <th>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => {
                const item = row as DataPanelRow;
                const execution = item as ExecutionRow;
                const attempts = execution.attempts ?? [];
                const displayName =
                  "name" in item
                    ? item.name
                    : (execution.job?.name ?? execution.jobId ?? "");
                const displayDate = item.createdAt ?? execution.startedAt ?? "";
                const rowId = item.id ?? String(index);
                const showCancelExecution = canCancelExecution(
                  execution.status,
                );
                const showRetryExecution = canRetryExecution(
                  execution.status,
                  execution.job?.status,
                );
                const jobActions = props.onJobAction
                  ? getJobRowActions(item.status)
                  : [];

                return (
                  <React.Fragment key={rowId}>
                    <tr>
                      <td>{item.id}</td>
                      <td>{item.status}</td>
                      <td>{String(displayName)}</td>
                      <td>{String(displayDate)}</td>
                      {props.expandableAttempts && (
                        <td>
                          <button
                            className="link-button"
                            onClick={() =>
                              setExpandedId(expandedId === rowId ? null : rowId)
                            }
                          >
                            {attempts.length} attempt
                            {attempts.length === 1 ? "" : "s"}
                          </button>
                        </td>
                      )}
                      {(props.onJobAction || props.onExecutionAction) && (
                        <td>
                          <div className="row-actions">
                            {props.onJobAction && (
                              <>
                                {jobActions.map((jobAction) => (
                                  <button
                                    className={jobAction.className}
                                    key={jobAction.action}
                                    onClick={() =>
                                      props.onJobAction?.(
                                        item.id,
                                        jobAction.action,
                                      )
                                    }
                                  >
                                    {jobAction.label}
                                  </button>
                                ))}
                              </>
                            )}
                            {props.onExecutionAction && (
                              <>
                                {showCancelExecution && (
                                  <button
                                    onClick={() =>
                                      props.onExecutionAction?.(
                                        item.id,
                                        "cancel",
                                      )
                                    }
                                  >
                                    Cancel
                                  </button>
                                )}
                                {showRetryExecution && (
                                  <button
                                    onClick={() =>
                                      props.onExecutionAction?.(
                                        item.id,
                                        "retry",
                                      )
                                    }
                                  >
                                    Retry
                                  </button>
                                )}
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
            <dd>
              {value === undefined || value === null || value === ""
                ? "-"
                : String(value)}
            </dd>
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
        const errorMessage = attempt.errorMessage
          ? String(attempt.errorMessage)
          : undefined;
        const responseBodyPreview = attempt.responseBodyPreview
          ? String(attempt.responseBodyPreview)
          : undefined;

        return (
          <article className="attempt-card" key={String(attempt.id ?? index)}>
            <div>
              <strong>
                Attempt {String(attempt.attemptNumber ?? index + 1)}
              </strong>
              <span>{String(attempt.status ?? "")}</span>
              <span>
                {attempt.httpStatusCode
                  ? `HTTP ${String(attempt.httpStatusCode)}`
                  : "No status code"}
              </span>
              <span>
                {attempt.durationMs
                  ? `${String(attempt.durationMs)}ms`
                  : "No duration"}
              </span>
            </div>
            {errorMessage && <pre>{errorMessage}</pre>}
            {responseBodyPreview && <pre>{responseBodyPreview}</pre>}
          </article>
        );
      })}
    </div>
  );
}
