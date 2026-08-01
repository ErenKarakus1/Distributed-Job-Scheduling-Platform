import { parseOptionalJson } from "../json.js";
import type { AuditFilters, NewJobFormState, PageState } from "../types.js";

export function createPageParams(page: PageState, statusFilter = "") {
  const params = new URLSearchParams({
    limit: String(page.limit),
    offset: String(page.offset),
  });

  if (statusFilter) {
    params.set("status", statusFilter);
  }

  return params;
}

export function createAuditParams(filters: AuditFilters) {
  const params = new URLSearchParams({
    limit: String(filters.limit),
  });

  if (filters.actorType) params.set("actorType", filters.actorType);
  if (filters.action) params.set("action", filters.action);
  if (filters.resourceType) params.set("resourceType", filters.resourceType);
  if (filters.resourceId) params.set("resourceId", filters.resourceId);

  return params;
}

export function createJobRequestBody(newJob: NewJobFormState) {
  const isRecurring = newJob.type === "RECURRING";
  const headers = parseOptionalJson<Record<string, string>>(newJob.headers, "Headers");
  const body = parseOptionalJson<unknown>(newJob.body, "Body");

  return {
    name: newJob.name,
    type: newJob.type,
    method: newJob.method,
    url: newJob.url,
    headers,
    body,
    timeoutMs: newJob.timeoutMs,
    maxAttempts: newJob.maxAttempts,
    backoffType: newJob.backoffType,
    retryInitialDelayMs: newJob.retryInitialDelayMs,
    retryMaxDelayMs: newJob.retryMaxDelayMs,
    runAt: isRecurring ? undefined : new Date(newJob.runAt).toISOString(),
    schedule: isRecurring
      ? {
          cronExpression: newJob.cronExpression,
          timezone: newJob.timezone,
          nextRunAt: new Date(newJob.nextRunAt).toISOString(),
        }
      : undefined,
  };
}
