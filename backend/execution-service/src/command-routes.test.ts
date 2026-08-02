import assert from "node:assert/strict";
import test from "node:test";
import { canRequeueDeadLetterMessage } from "./command-routes.js";

test("canRequeueDeadLetterMessage requires a linked execution id", () => {
  assert.equal(canRequeueDeadLetterMessage("execution-1"), true);
  assert.equal(canRequeueDeadLetterMessage(null), false);
  assert.equal(canRequeueDeadLetterMessage(undefined), false);
});
