import { z } from "zod";

export const executionStatusSchema = z.enum([
  "PENDING",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "RETRY_SCHEDULED",
  "STALLED",
  "CANCELED",
]);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const attemptStatusSchema = z.enum(["RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"]);

export const createExecutionSchema = z.object({
  jobId: z.string().uuid(),
  scheduledFor: z.coerce.date(),
});

export const markQueuedSchema = z.object({
  queuedAt: z.coerce.date().optional(),
});

export const markRunningSchema = z.object({
  workerId: z.string().uuid(),
  startedAt: z.coerce.date().optional(),
});

export const heartbeatSchema = z.object({
  workerId: z.string().uuid(),
  heartbeatAt: z.coerce.date().optional(),
});

export const recordAttemptSchema = z.object({
  workerId: z.string().uuid().optional(),
  status: attemptStatusSchema,
  httpStatusCode: z.number().int().min(100).max(599).optional(),
  responseBodyPreview: z.string().max(4000).optional(),
  errorMessage: z.string().max(4000).optional(),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
  durationMs: z.number().int().min(0).optional(),
});

export const recoverStalledSchema = z.object({
  now: z.coerce.date().optional(),
});

export const retryExecutionSchema = z.object({
  retryAt: z.coerce.date().optional(),
});

export function parseId(id: string) {
  return z.string().uuid().parse(id);
}
