import assert from "node:assert/strict";
import test from "node:test";
import { isSelfRoleChange } from "./user-routes.js";

test("isSelfRoleChange detects attempts to change the current user's role", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  assert.equal(isSelfRoleChange(userId, userId), true);
  assert.equal(isSelfRoleChange("22222222-2222-4222-8222-222222222222", userId), false);
  assert.equal(isSelfRoleChange(undefined, userId), false);
});
