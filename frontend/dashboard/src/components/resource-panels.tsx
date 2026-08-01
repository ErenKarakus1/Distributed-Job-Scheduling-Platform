import type { AuditEvent, AuthUser, WorkerRow } from "../types.js";

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
