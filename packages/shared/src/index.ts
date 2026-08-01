export const jobTypes = ["one_time", "recurring"] as const;
export const jobStatuses = ["active", "paused", "deleted"] as const;
export const executionStatuses = [
  "pending",
  "queued",
  "running",
  "succeeded",
  "failed",
  "retry_scheduled",
  "stalled",
  "canceled",
] as const;

export type JobType = (typeof jobTypes)[number];
export type JobStatus = (typeof jobStatuses)[number];
export type ExecutionStatus = (typeof executionStatuses)[number];

