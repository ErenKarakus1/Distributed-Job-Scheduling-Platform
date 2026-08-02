import type { AuditFilters, NewJobFormState } from "./types.js";
import { humanizeCronExpression } from "./utils/cron.js";

const fallbackTimezones = [
  "UTC",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getTimezoneOptions() {
  const intlWithTimezones = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };

  return intlWithTimezones.supportedValuesOf?.("timeZone") ?? fallbackTimezones;
}

const timezoneOptions = getTimezoneOptions();

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
          <input
            value={props.name}
            onChange={(event) => props.onChange(event.target.value)}
            required
          />
        </label>
        <button type="submit">Create</button>
      </form>
    </section>
  );
}

type JobCreateFormProps = {
  job: NewJobFormState;
  mode?: "create" | "edit";
  onCancel?: () => void;
  onChange: (job: NewJobFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function JobCreateForm(props: JobCreateFormProps) {
  const { job, onChange } = props;
  const isEditing = props.mode === "edit";
  const cronPreview = humanizeCronExpression(job.cronExpression);

  return (
    <section className="panel create-panel">
      <h2>{isEditing ? "Edit Job" : "Create Job"}</h2>
      <form className="job-form" onSubmit={props.onSubmit}>
        <fieldset className="job-form-section">
          <legend>Request</legend>
          <div className="job-form-grid request-grid">
            <label>
              Name
              <input
                value={job.name}
                onChange={(event) =>
                  onChange({ ...job, name: event.target.value })
                }
                required
              />
            </label>
            <label>
              Type
              <select
                value={job.type}
                onChange={(event) =>
                  onChange({ ...job, type: event.target.value })
                }
              >
                <option value="ONE_TIME">One-time</option>
                <option value="RECURRING">Recurring</option>
              </select>
            </label>
            <label>
              Method
              <select
                value={job.method}
                onChange={(event) =>
                  onChange({ ...job, method: event.target.value })
                }
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
            </label>
            <label className="url-field">
              URL
              <input
                value={job.url}
                onChange={(event) =>
                  onChange({ ...job, url: event.target.value })
                }
                required
              />
            </label>
            <label>
              Timeout
              <input
                type="number"
                min="100"
                max="300000"
                value={job.timeoutMs}
                onChange={(event) =>
                  onChange({ ...job, timeoutMs: Number(event.target.value) })
                }
                required
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="job-form-section">
          <legend>Schedule</legend>
          {job.type === "RECURRING" && (
            <datalist id="timezone-options">
              {timezoneOptions.map((timezone) => (
                <option key={timezone} value={timezone} />
              ))}
            </datalist>
          )}
          <div className="job-form-grid schedule-grid">
            {job.type === "ONE_TIME" ? (
              <label>
                Run at
                <input
                  type="datetime-local"
                  value={job.runAt}
                  onChange={(event) =>
                    onChange({ ...job, runAt: event.target.value })
                  }
                  required
                />
              </label>
            ) : (
              <>
                <label>
                  Cron
                  <input
                    value={job.cronExpression}
                    onChange={(event) =>
                      onChange({ ...job, cronExpression: event.target.value })
                    }
                    required
                  />
                  <span className="field-hint">{cronPreview}</span>
                </label>
                <label>
                  Timezone
                  <input
                    list="timezone-options"
                    value={job.timezone}
                    onChange={(event) =>
                      onChange({ ...job, timezone: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Next run
                  <input
                    type="datetime-local"
                    value={job.nextRunAt}
                    onChange={(event) =>
                      onChange({ ...job, nextRunAt: event.target.value })
                    }
                    required
                  />
                </label>
              </>
            )}
          </div>
        </fieldset>

        <fieldset className="job-form-section">
          <legend>Retry</legend>
          <div className="job-form-grid retry-grid">
            <label>
              Attempts
              <input
                type="number"
                min="1"
                max="20"
                value={job.maxAttempts}
                onChange={(event) =>
                  onChange({ ...job, maxAttempts: Number(event.target.value) })
                }
                required
              />
            </label>
            <label>
              Backoff
              <select
                value={job.backoffType}
                onChange={(event) =>
                  onChange({ ...job, backoffType: event.target.value })
                }
              >
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
                onChange={(event) =>
                  onChange({
                    ...job,
                    retryInitialDelayMs: Number(event.target.value),
                  })
                }
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
                onChange={(event) =>
                  onChange({
                    ...job,
                    retryMaxDelayMs: Number(event.target.value),
                  })
                }
                required
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="job-form-section payload-section">
          <legend>Payload</legend>
          <div className="job-form-grid payload-grid">
            <label>
              Headers JSON
              <textarea
                value={job.headers}
                onChange={(event) =>
                  onChange({ ...job, headers: event.target.value })
                }
              />
            </label>
            <label>
              Body JSON
              <textarea
                value={job.body}
                onChange={(event) =>
                  onChange({ ...job, body: event.target.value })
                }
              />
            </label>
          </div>
        </fieldset>

        <div className="job-form-actions">
          <button type="submit">
            {isEditing ? "Save changes" : "Create job"}
          </button>
          {isEditing && props.onCancel && (
            <button
              className="secondary-button"
              type="button"
              onClick={props.onCancel}
            >
              Cancel edit
            </button>
          )}
        </div>
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
        <select
          value={filters.actorType}
          onChange={(event) =>
            onChange({ ...filters, actorType: event.target.value })
          }
        >
          <option value="">All</option>
          <option value="USER">User</option>
          <option value="API_KEY">API key</option>
        </select>
      </label>
      <label>
        Action
        <input
          value={filters.action}
          onChange={(event) =>
            onChange({ ...filters, action: event.target.value })
          }
        />
      </label>
      <label>
        Resource
        <input
          value={filters.resourceType}
          onChange={(event) =>
            onChange({ ...filters, resourceType: event.target.value })
          }
        />
      </label>
      <label>
        Resource ID
        <input
          value={filters.resourceId}
          onChange={(event) =>
            onChange({ ...filters, resourceId: event.target.value })
          }
        />
      </label>
      <label>
        Limit
        <input
          type="number"
          min="1"
          max="100"
          value={filters.limit}
          onChange={(event) =>
            onChange({ ...filters, limit: Number(event.target.value) })
          }
        />
      </label>
      <button onClick={props.onApply}>Apply</button>
    </section>
  );
}
