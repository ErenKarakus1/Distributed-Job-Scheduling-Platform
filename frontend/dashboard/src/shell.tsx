import type { AuthUser } from "./types.js";

export type DashboardView = "overview" | "jobs" | "executions" | "workers" | "users" | "audit" | "health";

type SidebarProps = {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
};

const views: Array<{ id: DashboardView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "jobs", label: "Jobs" },
  { id: "executions", label: "Executions" },
  { id: "workers", label: "Workers" },
  { id: "users", label: "Users" },
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
        {views.map((view) => (
          <button className={props.activeView === view.id ? "active" : ""} onClick={() => props.onViewChange(view.id)} key={view.id}>
            {view.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

type ToolbarProps = {
  apiBaseUrl: string;
  apiKey: string;
  onApiBaseUrlChange: (apiBaseUrl: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onRefresh: () => void;
};

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <label>
        Gateway
        <input value={props.apiBaseUrl} onChange={(event) => props.onApiBaseUrlChange(event.target.value)} />
      </label>
      <label>
        API key
        <input value={props.apiKey} onChange={(event) => props.onApiKeyChange(event.target.value)} type="password" />
      </label>
      <button onClick={props.onRefresh}>Refresh</button>
    </header>
  );
}

type AuthFormState = {
  email: string;
  name: string;
  password: string;
};

type AuthStripProps = {
  authForm: AuthFormState;
  authMode: "login" | "register";
  authUser: AuthUser | null;
  onAuthFormChange: (authForm: AuthFormState) => void;
  onAuthModeChange: (authMode: "login" | "register") => void;
  onSignOut: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
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

  return (
    <section className="auth-strip">
      <form className="auth-form" onSubmit={props.onSubmit}>
        <select value={props.authMode} onChange={(event) => props.onAuthModeChange(event.target.value as "login" | "register")}>
          <option value="login">Login</option>
          <option value="register">Register</option>
        </select>
        <input
          value={props.authForm.email}
          onChange={(event) => props.onAuthFormChange({ ...props.authForm, email: event.target.value })}
          placeholder="Email"
          type="email"
          required
        />
        {props.authMode === "register" && (
          <input value={props.authForm.name} onChange={(event) => props.onAuthFormChange({ ...props.authForm, name: event.target.value })} placeholder="Name" required />
        )}
        <input
          value={props.authForm.password}
          onChange={(event) => props.onAuthFormChange({ ...props.authForm, password: event.target.value })}
          placeholder="Password"
          type="password"
          required
        />
        <button type="submit">{props.authMode === "login" ? "Sign in" : "Create"}</button>
      </form>
    </section>
  );
}
