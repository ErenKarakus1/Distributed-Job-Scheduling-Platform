/// <reference types="vite/client" />

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
};

export type CreatedApiKey = ApiKeyRow & {
  apiKey: string;
};

export type AuditEvent = {
  id: string;
  actorType: string;
  actorLabel?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  metadata?: unknown;
  createdAt: string;
};

export type JobSchedule = {
  cronExpression?: string;
  nextRunAt?: string;
  timezone?: string;
};

export type JobRow = {
  id: string;
  name: string;
  type?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string> | null;
  body?: unknown;
  runAt?: string | null;
  maxAttempts?: number;
  backoffType?: string;
  retryInitialDelayMs?: number;
  retryMaxDelayMs?: number;
  timeoutMs?: number;
  status: string;
  createdAt: string;
  schedule?: JobSchedule | null;
};

export type ExecutionAttempt = {
  id?: string;
  attemptNumber?: number;
  status?: string;
  httpStatusCode?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  responseBodyPreview?: string | null;
};

export type ExecutionRow = {
  id: string;
  jobId?: string;
  status: string;
  scheduledFor?: string;
  nextAttemptAt?: string | null;
  lockedByWorkerId?: string | null;
  lastHeartbeatAt?: string | null;
  finishedAt?: string | null;
  attemptCount?: number;
  createdAt?: string;
  startedAt?: string | null;
  job?: Pick<JobRow, "id" | "name"> | null;
  attempts?: ExecutionAttempt[];
};

export type WorkerRow = {
  id: string;
  serviceInstanceId?: string;
  status?: string;
  activeExecutionCount?: number;
  currentExecutionId?: string | null;
  lastHeartbeatAt?: string;
};

export type MetricsOverview = {
  jobs?: {
    total?: number;
    active?: number;
    paused?: number;
  };
  executions?: {
    running?: number;
    queued?: number;
    retryScheduled?: number;
    failed?: number;
    succeeded?: number;
  };
  workers?: {
    active?: number;
  };
};

export type ServiceHealthEntry = {
  statusCode: number;
  body?: {
    service?: string;
    status?: string;
    [key: string]: unknown;
  };
  error?: string;
};

export type ServiceHealthMap = Record<string, ServiceHealthEntry>;

export type PageState = {
  limit: number;
  offset: number;
  total: number;
};

export type PageResponse<T> = {
  data: T[];
  page: PageState;
};

export type NewJobFormState = {
  name: string;
  type: string;
  method: string;
  url: string;
  headers: string;
  body: string;
  runAt: string;
  cronExpression: string;
  timezone: string;
  nextRunAt: string;
  maxAttempts: number;
  backoffType: string;
  retryInitialDelayMs: number;
  retryMaxDelayMs: number;
  timeoutMs: number;
};

export type AuditFilters = {
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  limit: number;
};
