import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancelExecution,
  canRequeueDeadLetter,
  canRetryExecution,
  getJobRowActions,
} from "./data-panel.js";

test("canCancelExecution allows only non-terminal execution statuses", () => {
  assert.equal(canCancelExecution("PENDING"), true);
  assert.equal(canCancelExecution("QUEUED"), true);
  assert.equal(canCancelExecution("RUNNING"), true);
  assert.equal(canCancelExecution("RETRY_SCHEDULED"), true);
  assert.equal(canCancelExecution("STALLED"), true);
  assert.equal(canCancelExecution("SUCCEEDED"), false);
  assert.equal(canCancelExecution("FAILED"), false);
  assert.equal(canCancelExecution("CANCELED"), false);
});

test("canRetryExecution allows failed and canceled executions", () => {
  assert.equal(canRetryExecution("FAILED"), true);
  assert.equal(canRetryExecution("CANCELED"), true);
  assert.equal(canRetryExecution("SUCCEEDED"), false);
  assert.equal(canRetryExecution("RUNNING"), false);
});

test("canRetryExecution blocks executions for deleted jobs", () => {
  assert.equal(canRetryExecution("FAILED", "DELETED"), false);
  assert.equal(canRetryExecution("CANCELED", "DELETED"), false);
});

test("canRequeueDeadLetter requires a linked execution with an active job", () => {
  assert.equal(
    canRequeueDeadLetter({
      id: "message-1",
      executionId: null,
      reason: "MALFORMED_MESSAGE",
      payload: {},
      sourceQueue: "execution.ready",
      createdAt: "2026-08-02T12:00:00.000Z",
      execution: null,
    }),
    false,
  );

  assert.equal(
    canRequeueDeadLetter({
      id: "message-2",
      executionId: "execution-1",
      reason: "MAX_ATTEMPTS_EXHAUSTED",
      payload: {},
      sourceQueue: "execution.ready",
      createdAt: "2026-08-02T12:00:00.000Z",
      execution: {
        id: "execution-1",
        jobId: "job-1",
        status: "FAILED",
        attemptCount: 1,
        job: { id: "job-1", status: "DELETED" },
      },
    }),
    false,
  );

  assert.equal(
    canRequeueDeadLetter({
      id: "message-3",
      executionId: "execution-2",
      reason: "MAX_ATTEMPTS_EXHAUSTED",
      payload: {},
      sourceQueue: "execution.ready",
      createdAt: "2026-08-02T12:00:00.000Z",
      execution: {
        id: "execution-2",
        jobId: "job-2",
        status: "FAILED",
        attemptCount: 1,
        job: { id: "job-2", status: "ACTIVE" },
      },
    }),
    true,
  );
});

test("getJobRowActions exposes active job controls", () => {
  assert.deepEqual(
    getJobRowActions("ACTIVE").map((action) => action.action),
    ["run", "pause", "edit", "delete"],
  );
});

test("getJobRowActions exposes paused job controls", () => {
  assert.deepEqual(
    getJobRowActions("PAUSED").map((action) => action.action),
    ["resume", "edit", "delete"],
  );
});

test("getJobRowActions hides controls for deleted jobs", () => {
  assert.deepEqual(getJobRowActions("DELETED"), []);
});
