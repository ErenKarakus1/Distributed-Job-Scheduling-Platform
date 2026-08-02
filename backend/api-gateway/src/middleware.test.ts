import assert from "node:assert/strict";
import test from "node:test";
import { canAccessAdminRoute } from "./middleware.js";

test("canAccessAdminRoute requires an admin user", () => {
  assert.equal(canAccessAdminRoute({ role: "ADMIN" }), true);
  assert.equal(canAccessAdminRoute({ role: "VIEWER" }), false);
  assert.equal(canAccessAdminRoute(undefined), false);
});
