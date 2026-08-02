import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancelExecution,
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
