import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedExecutionAction,
  isAllowedJobAction,
} from "./proxy-routes.js";

test("isAllowedJobAction exposes only public job actions", () => {
  assert.equal(isAllowedJobAction("run"), true);
  assert.equal(isAllowedJobAction("pause"), true);
  assert.equal(isAllowedJobAction("resume"), true);
  assert.equal(isAllowedJobAction("delete"), false);
  assert.equal(isAllowedJobAction(undefined), false);
});

test("isAllowedExecutionAction hides internal worker execution actions", () => {
  assert.equal(isAllowedExecutionAction("cancel"), true);
  assert.equal(isAllowedExecutionAction("retry"), true);
  assert.equal(isAllowedExecutionAction("mark-running"), false);
  assert.equal(isAllowedExecutionAction("attempts"), false);
  assert.equal(isAllowedExecutionAction("heartbeat"), false);
});
