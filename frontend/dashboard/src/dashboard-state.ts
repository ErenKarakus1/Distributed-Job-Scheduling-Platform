import type { AuditFilters, NewJobFormState, PageState } from "./types.js";

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
