import type { AuditFilters, NewJobFormState } from "./types.js";

type ApiKeyCreateFormProps = {
  name: string;
  onChange: (name: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function ApiKeyCreateForm(props: ApiKeyCreateFormProps) {
  return (
    <section className="panel compact-panel">
      <h2>Create API Key</h2>
      <form className="api-key-form" onSubmit={props.onSubmit}>
        <label>
          Name
          <input value={props.name} onChange={(event) => props.onChange(event.target.value)} required />
        </label>
        <button type="submit">Create</button>
      </form>
    </section>
  );
}

type JobCreateFormProps = {
  job: NewJobFormState;
  onChange: (job: NewJobFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function JobCreateForm(props: JobCreateFormProps) {
  const { job, onChange } = props;

  return (
    <section className="panel create-panel">
      <h2>Create Job</h2>
      <form className="job-form" onSubmit={props.onSubmit}>
        <label>
          Name
          <input value={job.name} onChange={(event) => onChange({ ...job, name: event.target.value })} required />
        </label>
        <label>
          Type
          <select value={job.type} onChange={(event) => onChange({ ...job, type: event.target.value })}>
            <option value="ONE_TIME">One-time</option>
            <option value="RECURRING">Recurring</option>
          </select>
        </label>
        <label>
          Method
          <select value={job.method} onChange={(event) => onChange({ ...job, method: event.target.value })}>
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
        </label>
        <label>
          URL
          <input value={job.url} onChange={(event) => onChange({ ...job, url: event.target.value })} required />
        </label>
        <label className="wide-field">
          Headers JSON
          <textarea value={job.headers} onChange={(event) => onChange({ ...job, headers: event.target.value })} />
        </label>
        <label className="wide-field">
          Body JSON
          <textarea value={job.body} onChange={(event) => onChange({ ...job, body: event.target.value })} />
        </label>
        {job.type === "ONE_TIME" ? (
          <label>
            Run at
            <input type="datetime-local" value={job.runAt} onChange={(event) => onChange({ ...job, runAt: event.target.value })} required />
          </label>
        ) : (
          <>
            <label>
              Cron
              <input value={job.cronExpression} onChange={(event) => onChange({ ...job, cronExpression: event.target.value })} required />
            </label>
            <label>
              Timezone
              <input value={job.timezone} onChange={(event) => onChange({ ...job, timezone: event.target.value })} required />
            </label>
            <label>
              Next run
              <input type="datetime-local" value={job.nextRunAt} onChange={(event) => onChange({ ...job, nextRunAt: event.target.value })} required />
            </label>
          </>
        )}
        <label>
          Attempts
          <input type="number" min="1" max="20" value={job.maxAttempts} onChange={(event) => onChange({ ...job, maxAttempts: Number(event.target.value) })} required />
        </label>
        <label>
          Backoff
          <select value={job.backoffType} onChange={(event) => onChange({ ...job, backoffType: event.target.value })}>
            <option value="EXPONENTIAL">Exponential</option>
            <option value="FIXED">Fixed</option>
          </select>
        </label>
        <label>
          Initial delay
          <input
            type="number"
            min="0"
            max="3600000"
            value={job.retryInitialDelayMs}
            onChange={(event) => onChange({ ...job, retryInitialDelayMs: Number(event.target.value) })}
            required
          />
        </label>
        <label>
          Max delay
          <input
            type="number"
            min="0"
            max="86400000"
            value={job.retryMaxDelayMs}
            onChange={(event) => onChange({ ...job, retryMaxDelayMs: Number(event.target.value) })}
            required
          />
        </label>
        <label>
          Timeout
          <input type="number" min="100" max="300000" value={job.timeoutMs} onChange={(event) => onChange({ ...job, timeoutMs: Number(event.target.value) })} required />
        </label>
        <button type="submit">Create</button>
      </form>
    </section>
  );
}

type AuditFilterBarProps = {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
  onApply: () => void;
};

export function AuditFilterBar(props: AuditFilterBarProps) {
  const { filters, onChange } = props;

  return (
    <section className="audit-filter-bar">
      <label>
        Actor
        <select value={filters.actorType} onChange={(event) => onChange({ ...filters, actorType: event.target.value })}>
          <option value="">All</option>
          <option value="USER">User</option>
          <option value="API_KEY">API key</option>
        </select>
      </label>
      <label>
        Action
        <input value={filters.action} onChange={(event) => onChange({ ...filters, action: event.target.value })} />
      </label>
      <label>
        Resource
        <input value={filters.resourceType} onChange={(event) => onChange({ ...filters, resourceType: event.target.value })} />
      </label>
      <label>
        Resource ID
        <input value={filters.resourceId} onChange={(event) => onChange({ ...filters, resourceId: event.target.value })} />
      </label>
      <label>
        Limit
        <input type="number" min="1" max="100" value={filters.limit} onChange={(event) => onChange({ ...filters, limit: Number(event.target.value) })} />
      </label>
      <button onClick={props.onApply}>Apply</button>
    </section>
  );
}
