import type { ApiKeyRow, AuditEvent, AuthUser, CreatedApiKey, DeadLetterRow, DeadLetterSummary, ServiceHealthMap, WorkerRow } from "../types.js";

export function WorkerPanel(props: { rows: WorkerRow[] }) {
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
              {props.rows.map((worker, index) => {
                return (
                  <tr key={worker.id ?? String(index)}>
                    <td>{worker.serviceInstanceId ?? worker.id ?? ""}</td>
                    <td>
                      <span className={`status-pill ${String(worker.status ?? "").toLowerCase()}`}>{String(worker.status ?? "")}</span>
                    </td>
                    <td>{worker.activeExecutionCount ?? 0}</td>
                    <td>{worker.currentExecutionId ?? "-"}</td>
                    <td>{worker.lastHeartbeatAt ?? ""}</td>
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

export function DeadLetterPanel(props: { rows: DeadLetterRow[]; summary: DeadLetterSummary; onDiscard: (messageId: string) => void; onRequeue: (messageId: string) => void }) {
  return (
    <section className="panel">
      <h2>Dead Letter Queue</h2>
      <div className="metric-grid compact-metrics">
        <div className="metric-card">
          <span>Active messages</span>
          <strong>{props.summary.active ?? props.rows.length}</strong>
        </div>
        <div className="metric-card">
          <span>Oldest message</span>
          <strong>{props.summary.oldestCreatedAt ?? "-"}</strong>
        </div>
      </div>
      {props.rows.length === 0 ? (
        <p className="empty-state">No dead-letter messages loaded</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Reason</th>
                <th>Execution</th>
                <th>Job</th>
                <th>Queue</th>
                <th>Error</th>
                <th>Payload</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((message) => (
                <tr key={message.id}>
                  <td>{message.createdAt}</td>
                  <td>{message.reason}</td>
                  <td>{message.executionId ?? "-"}</td>
                  <td>{message.execution?.jobId ?? "-"}</td>
                  <td>{message.sourceQueue}</td>
                  <td>{message.error ?? "-"}</td>
                  <td className="metadata-cell">{JSON.stringify(message.payload)}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => props.onRequeue(message.id)}>Requeue</button>
                      <button onClick={() => props.onDiscard(message.id)}>Discard</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function UserPanel(props: { currentUserId: string; rows: AuthUser[]; onRoleChange: (userId: string, role: "ADMIN" | "VIEWER") => void }) {
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
              {props.rows.map((user) => {
                const isCurrentUser = user.id === props.currentUserId;

                return (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.name}</td>
                    <td>
                      {isCurrentUser ? (
                        <span className="locked-role">{user.role}</span>
                      ) : (
                        <select className="inline-select" value={user.role} onChange={(event) => props.onRoleChange(user.id, event.target.value as "ADMIN" | "VIEWER")}>
                          <option value="ADMIN">ADMIN</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                      )}
                    </td>
                    <td>{user.id}</td>
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

export function ApiKeyPanel(props: { rows: ApiKeyRow[]; createdKey: CreatedApiKey | null; onRevoke: (apiKeyId: string) => void }) {
  return (
    <section className="panel">
      <h2>API Keys</h2>
      {props.createdKey && (
        <div className="secret-box">
          <span>{props.createdKey.name}</span>
          <code>{props.createdKey.apiKey}</code>
        </div>
      )}
      {props.rows.length === 0 ? (
        <p className="empty-state">No API keys loaded</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th>Updated</th>
                <th>ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((apiKey) => (
                <tr key={apiKey.id}>
                  <td>{apiKey.name}</td>
                  <td>{apiKey.createdAt}</td>
                  <td>{apiKey.updatedAt ?? "-"}</td>
                  <td>{apiKey.id}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => props.onRevoke(apiKey.id)}>Revoke</button>
                    </div>
                  </td>
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

export function HealthPanel(props: { health: ServiceHealthMap }) {
  const entries = Object.entries(props.health);

  return (
    <section className="panel">
      <h2>Service Health</h2>
      {entries.length === 0 ? (
        <p className="empty-state">No service health loaded</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>HTTP</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([service, result]) => {
                const status = result.body?.status ?? (result.statusCode >= 200 && result.statusCode < 300 ? "ok" : "error");
                const details = result.error ?? result.body?.service ?? JSON.stringify(result.body ?? {});

                return (
                  <tr key={service}>
                    <td>{service}</td>
                    <td>{result.statusCode}</td>
                    <td>
                      <span className={`status-pill ${String(status).toLowerCase()}`}>{status}</span>
                    </td>
                    <td>{details || "-"}</td>
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
