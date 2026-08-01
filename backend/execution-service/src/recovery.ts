import { calculateBackoffDelayMs } from "./retry.js";

export type StalledExecutionJob = {
  maxAttempts: number;
  backoffType: "FIXED" | "EXPONENTIAL";
  retryInitialDelayMs: number;
  retryMaxDelayMs: number;
};

export type StalledExecution = {
  attemptCount: number;
  startedAt: Date | null;
  lastHeartbeatAt: Date | null;
  job: StalledExecutionJob;
};

export function calculateStaleBefore(now: Date, stalledAfterMs: number) {
  return new Date(now.getTime() - stalledAfterMs);
}

export function isExecutionStale(execution: Pick<StalledExecution, "lastHeartbeatAt">, staleBefore: Date) {
  return Boolean(execution.lastHeartbeatAt && execution.lastHeartbeatAt < staleBefore);
}

export function planStalledExecutionRecovery(execution: StalledExecution, now: Date, stalledAfterMs: number) {
  const attemptNumber = execution.attemptCount + 1;
  const retryable = attemptNumber < execution.job.maxAttempts;
  const status: "RETRY_SCHEDULED" | "FAILED" = retryable ? "RETRY_SCHEDULED" : "FAILED";
  const nextAttemptAt = retryable
    ? new Date(now.getTime() + calculateBackoffDelayMs(execution.job, attemptNumber + 1))
    : null;

  return {
    attemptNumber,
    retryable,
    nextAttemptAt,
    status,
    finishedAt: retryable ? null : now,
    startedAt: execution.startedAt ?? execution.lastHeartbeatAt ?? undefined,
    durationMs: execution.startedAt ? now.getTime() - execution.startedAt.getTime() : undefined,
    errorMessage: `Execution stalled after ${stalledAfterMs}ms without heartbeat`,
  };
}
