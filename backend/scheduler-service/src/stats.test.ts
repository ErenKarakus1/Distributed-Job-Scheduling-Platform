import assert from "node:assert/strict";
import test from "node:test";
import { countQueuedExecutions } from "./stats.js";

test("countQueuedExecutions sums every scheduler queue bucket", () => {
  assert.equal(
    countQueuedExecutions({
      oneTimeQueued: 2,
      recurringQueued: 3,
      retriesQueued: 5,
      pendingQueued: 7,
    }),
    17,
  );
});

test("countQueuedExecutions returns zero when no executions were queued", () => {
  assert.equal(
    countQueuedExecutions({
      oneTimeQueued: 0,
      recurringQueued: 0,
      retriesQueued: 0,
      pendingQueued: 0,
    }),
    0,
  );
});
