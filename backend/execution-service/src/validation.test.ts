import assert from "node:assert/strict";
import test from "node:test";
import {
  createExecutionSchema,
  executionStatusSchema,
  heartbeatSchema,
  markRunningSchema,
  paginationSchema,
  parseId,
  recordAttemptSchema,
  recoverStalledSchema,
  retryExecutionSchema,
} from "./validation.js";

const id = "11111111-1111-4111-8111-111111111111";

test("parseId accepts UUIDs and rejects invalid ids", () => {
  assert.equal(parseId(id), id);
  assert.throws(() => parseId("not-a-uuid"));
});

test("executionStatusSchema accepts known execution states only", () => {
  assert.equal(executionStatusSchema.parse("RUNNING"), "RUNNING");
  assert.equal(executionStatusSchema.safeParse("UNKNOWN").success, false);
});

test("paginationSchema coerces defaults and caps limits", () => {
  assert.deepEqual(paginationSchema.parse({}), { limit: 25, offset: 0 });
  assert.deepEqual(paginationSchema.parse({ limit: "50", offset: "10" }), { limit: 50, offset: 10 });
  assert.equal(paginationSchema.safeParse({ limit: "101" }).success, false);
  assert.equal(paginationSchema.safeParse({ offset: "-1" }).success, false);
});

test("createExecutionSchema requires a job id and scheduled date", () => {
  const parsed = createExecutionSchema.parse({
    jobId: id,
    scheduledFor: "2026-08-02T12:00:00.000Z",
  });

  assert.equal(parsed.jobId, id);
  assert.equal(parsed.scheduledFor.toISOString(), "2026-08-02T12:00:00.000Z");
  assert.equal(createExecutionSchema.safeParse({ jobId: id, scheduledFor: "not-a-date" }).success, false);
});

test("markRunningSchema and heartbeatSchema require worker UUIDs", () => {
  assert.equal(markRunningSchema.parse({ workerId: id }).workerId, id);
  assert.equal(heartbeatSchema.parse({ workerId: id, heartbeatAt: "2026-08-02T12:00:00.000Z" }).heartbeatAt?.toISOString(), "2026-08-02T12:00:00.000Z");
  assert.equal(markRunningSchema.safeParse({ workerId: "worker-1" }).success, false);
  assert.equal(heartbeatSchema.safeParse({ workerId: "worker-1" }).success, false);
});

test("recordAttemptSchema validates attempt status, response code, and duration", () => {
  const parsed = recordAttemptSchema.parse({
    workerId: id,
    status: "FAILED",
    httpStatusCode: 502,
    errorMessage: "upstream failed",
    durationMs: 120,
  });

  assert.equal(parsed.status, "FAILED");
  assert.equal(recordAttemptSchema.safeParse({ status: "FAILED", httpStatusCode: 99 }).success, false);
  assert.equal(recordAttemptSchema.safeParse({ status: "FAILED", durationMs: -1 }).success, false);
  assert.equal(recordAttemptSchema.safeParse({ status: "RETRY_SCHEDULED" }).success, false);
});

test("recoverStalledSchema coerces optional recovery time", () => {
  assert.deepEqual(recoverStalledSchema.parse({}), {});
  assert.equal(recoverStalledSchema.parse({ now: "2026-08-02T12:00:00.000Z" }).now?.toISOString(), "2026-08-02T12:00:00.000Z");
  assert.equal(recoverStalledSchema.safeParse({ now: "not-a-date" }).success, false);
});

test("retryExecutionSchema coerces optional retry time", () => {
  assert.deepEqual(retryExecutionSchema.parse({}), {});
  assert.equal(retryExecutionSchema.parse({ retryAt: "2026-08-02T12:00:00.000Z" }).retryAt?.toISOString(), "2026-08-02T12:00:00.000Z");
  assert.equal(retryExecutionSchema.safeParse({ retryAt: "not-a-date" }).success, false);
});
