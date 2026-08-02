import type React from "react";

type AuthFormState = {
  email: string;
  name: string;
  password: string;
};

type AuthPageProps = {
  authForm: AuthFormState;
  authMode: "login" | "register";
  isRestoringSession: boolean;
  message: string;
  onAuthFormChange: (authForm: AuthFormState) => void;
  onAuthModeChange: (authMode: "login" | "register") => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function AuthPage(props: AuthPageProps) {
  if (props.isRestoringSession) {
    return (
      <main className="auth-page">
        <section className="auth-hero">
          <p className="eyebrow">Distributed</p>
          <h1>Job Scheduler</h1>
          <p>Schedule HTTP work, watch executions, and keep distributed workers moving.</p>
        </section>

        <section className="auth-panel" aria-label="Restoring session">
          <div className="auth-panel-header">
            <div>
              <p className="eyebrow">Dashboard Access</p>
              <h2>Restoring Session</h2>
            </div>
          </div>

          <div className="auth-status">Checking your saved session</div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Distributed</p>
        <h1>Job Scheduler</h1>
        <p>Schedule HTTP work, watch executions, and keep distributed workers moving.</p>
      </section>

      <section className="auth-panel" aria-label="Authentication">
        <div className="auth-panel-header">
          <div>
            <p className="eyebrow">Dashboard Access</p>
            <h2>{props.authMode === "login" ? "Sign in" : "Create account"}</h2>
          </div>

          <div className="segmented-control" aria-label="Authentication mode">
            <button className={props.authMode === "login" ? "active" : ""} type="button" onClick={() => props.onAuthModeChange("login")}>
              Login
            </button>
            <button className={props.authMode === "register" ? "active" : ""} type="button" onClick={() => props.onAuthModeChange("register")}>
              Register
            </button>
          </div>
        </div>

        <form className="auth-page-form" onSubmit={props.onSubmit}>
          <label>
            Email
            <input value={props.authForm.email} onChange={(event) => props.onAuthFormChange({ ...props.authForm, email: event.target.value })} type="email" required />
          </label>

          {props.authMode === "register" && (
            <label>
              Name
              <input value={props.authForm.name} onChange={(event) => props.onAuthFormChange({ ...props.authForm, name: event.target.value })} required />
            </label>
          )}

          <label>
            Password
            <input value={props.authForm.password} onChange={(event) => props.onAuthFormChange({ ...props.authForm, password: event.target.value })} type="password" required />
          </label>

          <button type="submit">
            {props.authMode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-status">{props.message}</div>
      </section>
    </main>
  );
}
