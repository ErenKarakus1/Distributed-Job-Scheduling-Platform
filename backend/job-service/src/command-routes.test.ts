import assert from "node:assert/strict";
import test from "node:test";
import { canChangeJobStatus } from "./command-routes.js";

test("canChangeJobStatus blocks changes to deleted jobs", () => {
  assert.equal(canChangeJobStatus("ACTIVE"), true);
  assert.equal(canChangeJobStatus("PAUSED"), true);
  assert.equal(canChangeJobStatus("DELETED"), false);
});
