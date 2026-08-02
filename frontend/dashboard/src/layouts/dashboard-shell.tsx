import type { AuthUser } from "../types.js";

export type DashboardView = "overview" | "jobs" | "executions" | "workers" | "deadLetter" | "users" | "apiKeys" | "audit" | "health";

type SidebarProps = {
  activeView: DashboardView;
  authUser: AuthUser;
  onViewChange: (view: DashboardView) => void;
};

const views: Array<{ id: DashboardView; label: string; adminOnly?: boolean }> = [
  { id: "overview", label: "Overview" },
  { id: "jobs", label: "Jobs" },
  { id: "executions", label: "Executions" },
  { id: "workers", label: "Workers" },
  { id: "deadLetter", label: "Dead Letter", adminOnly: true },
  { id: "users", label: "Users", adminOnly: true },
  { id: "apiKeys", label: "API Keys", adminOnly: true },
  { id: "audit", label: "Audit" },
  { id: "health", label: "Health" },
];

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar">
      <div>
        <p className="eyebrow">Distributed</p>
        <h1>Job Scheduler</h1>
      </div>

      <nav className="nav-tabs" aria-label="Dashboard views">
        {views
          .filter((view) => !view.adminOnly || props.authUser.role === "ADMIN")
          .map((view) => (
            <button className={props.activeView === view.id ? "active" : ""} onClick={() => props.onViewChange(view.id)} key={view.id}>
              {view.label}
            </button>
          ))}
      </nav>
    </aside>
  );
}

type ToolbarProps = {
  onRefresh: () => void;
};

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div>
        <p className="eyebrow">Dashboard</p>
        <h2>Control Plane</h2>
      </div>
      <button onClick={props.onRefresh}>Refresh</button>
    </header>
  );
}

type AuthStripProps = {
  authUser: AuthUser | null;
  onSignOut: () => void;
};

export function AuthStrip(props: AuthStripProps) {
  if (props.authUser) {
    return (
      <section className="auth-strip">
        <span>
          {props.authUser.name} / {props.authUser.role}
        </span>
        <button onClick={props.onSignOut}>Sign out</button>
      </section>
    );
  }

  return null;
}
