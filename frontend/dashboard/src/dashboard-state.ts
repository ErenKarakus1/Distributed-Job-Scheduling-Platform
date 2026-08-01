import type { AuditFilters, JobRow, NewJobFormState, PageState } from "./types.js";

export const AUTH_TOKEN_STORAGE_KEY = "scheduler.jwt";

export const DEFAULT_PAGE_STATE: PageState = {
  limit: 25,
  offset: 0,
  total: 0,
};

export function createDefaultAuditFilters(): AuditFilters {
  return {
    actorType: "",
    action: "",
    resourceType: "",
    resourceId: "",
    limit: 50,
  };
}

export function createDefaultJobForm(): NewJobFormState {
  const nextRunAt = new Date(Date.now() + 60000).toISOString().slice(0, 16);

  return {
    name: "",
    type: "ONE_TIME",
    method: "POST",
    url: "",
    headers: "{\n  \"content-type\": \"application/json\"\n}",
    body: "{\n  \"message\": \"scheduled hello\"\n}",
    runAt: nextRunAt,
    cronExpression: "*/5 * * * *",
    timezone: "UTC",
    nextRunAt,
    maxAttempts: 3,
    backoffType: "EXPONENTIAL",
    retryInitialDelayMs: 1000,
    retryMaxDelayMs: 60000,
    timeoutMs: 30000,
  };
}

export function createEmptyAuthForm() {
  return {
    email: "",
    name: "",
    password: "",
  };
}

function toDatetimeLocal(value?: string | null) {
  if (!value) {
    return new Date(Date.now() + 60000).toISOString().slice(0, 16);
  }

  return new Date(value).toISOString().slice(0, 16);
}

export function createJobFormFromRow(job: JobRow): NewJobFormState {
  const defaults = createDefaultJobForm();

  return {
    name: job.name,
    type: job.type ?? defaults.type,
    method: job.method ?? defaults.method,
    url: job.url ?? defaults.url,
    headers: JSON.stringify(job.headers ?? {}, null, 2),
    body: job.body === undefined || job.body === null ? "" : JSON.stringify(job.body, null, 2),
    runAt: toDatetimeLocal(job.runAt),
    cronExpression: job.schedule?.cronExpression ?? defaults.cronExpression,
    timezone: job.schedule?.timezone ?? defaults.timezone,
    nextRunAt: toDatetimeLocal(job.schedule?.nextRunAt),
    maxAttempts: job.maxAttempts ?? defaults.maxAttempts,
    backoffType: job.backoffType ?? defaults.backoffType,
    retryInitialDelayMs: job.retryInitialDelayMs ?? defaults.retryInitialDelayMs,
    retryMaxDelayMs: job.retryMaxDelayMs ?? defaults.retryMaxDelayMs,
    timeoutMs: job.timeoutMs ?? defaults.timeoutMs,
  };
}
