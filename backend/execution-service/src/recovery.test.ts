import assert from "node:assert/strict";
import test from "node:test";
import { calculateStaleBefore, isExecutionStale, planStalledExecutionRecovery } from "./recovery.js";

const job = {
  maxAttempts: 3,
  backoffType: "EXPONENTIAL" as const,
  retryInitialDelayMs: 1000,
  retryMaxDelayMs: 10000,
};

test("calculateStaleBefore subtracts the stalled threshold from now", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");

  assert.equal(calculateStaleBefore(now, 60000).toISOString(), "2026-08-02T11:59:00.000Z");
});

test("isExecutionStale requires a heartbeat older than the stale boundary", () => {
  const staleBefore = new Date("2026-08-02T11:59:00.000Z");

  assert.equal(isExecutionStale({ lastHeartbeatAt: new Date("2026-08-02T11:58:59.999Z") }, staleBefore), true);
  assert.equal(isExecutionStale({ lastHeartbeatAt: new Date("2026-08-02T11:59:00.000Z") }, staleBefore), false);
  assert.equal(isExecutionStale({ lastHeartbeatAt: null }, staleBefore), false);
});

test("planStalledExecutionRecovery schedules a retry when attempts remain", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");
  const recovery = planStalledExecutionRecovery(
    {
      attemptCount: 1,
      startedAt: new Date("2026-08-02T11:58:00.000Z"),
      lastHeartbeatAt: new Date("2026-08-02T11:58:30.000Z"),
      job,
    },
    now,
    60000,
  );

  assert.equal(recovery.attemptNumber, 2);
  assert.equal(recovery.retryable, true);
  assert.equal(recovery.status, "RETRY_SCHEDULED");
  assert.equal(recovery.nextAttemptAt?.toISOString(), "2026-08-02T12:00:02.000Z");
  assert.equal(recovery.finishedAt, null);
  assert.equal(recovery.durationMs, 120000);
  assert.equal(recovery.errorMessage, "Execution stalled after 60000ms without heartbeat");
});

test("planStalledExecutionRecovery fails an execution when max attempts are reached", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");
  const recovery = planStalledExecutionRecovery(
    {
      attemptCount: 2,
      startedAt: null,
      lastHeartbeatAt: new Date("2026-08-02T11:58:30.000Z"),
      job,
    },
    now,
    60000,
  );

  assert.equal(recovery.attemptNumber, 3);
  assert.equal(recovery.retryable, false);
  assert.equal(recovery.status, "FAILED");
  assert.equal(recovery.nextAttemptAt, null);
  assert.equal(recovery.finishedAt, now);
  assert.equal(recovery.startedAt?.toISOString(), "2026-08-02T11:58:30.000Z");
  assert.equal(recovery.durationMs, undefined);
});
