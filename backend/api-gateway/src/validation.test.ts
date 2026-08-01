import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiKeySchema,
  loginSchema,
  parseRouteId,
  registerSchema,
  updateUserRoleSchema,
  userRoleSchema,
} from "./validation.js";

const routeId = "11111111-1111-4111-8111-111111111111";

test("createApiKeySchema requires a non-empty key name", () => {
  assert.equal(createApiKeySchema.parse({ name: "dashboard local" }).name, "dashboard local");
  assert.equal(createApiKeySchema.safeParse({ name: "" }).success, false);
});

test("registerSchema normalizes emails and validates password length", () => {
  const parsed = registerSchema.parse({
    email: "Admin@Example.COM",
    name: "Admin",
    password: "password123",
  });

  assert.equal(parsed.email, "admin@example.com");
  assert.equal(registerSchema.safeParse({ email: "bad", name: "Admin", password: "password123" }).success, false);
  assert.equal(registerSchema.safeParse({ email: "admin@example.com", name: "Admin", password: "short" }).success, false);
});

test("loginSchema normalizes emails and accepts non-empty passwords", () => {
  const parsed = loginSchema.parse({ email: "Viewer@Example.COM", password: "secret" });

  assert.equal(parsed.email, "viewer@example.com");
  assert.equal(loginSchema.safeParse({ email: "viewer@example.com", password: "" }).success, false);
});

test("updateUserRoleSchema allows only supported roles", () => {
  assert.equal(userRoleSchema.parse("ADMIN"), "ADMIN");
  assert.equal(updateUserRoleSchema.parse({ role: "VIEWER" }).role, "VIEWER");
  assert.equal(updateUserRoleSchema.safeParse({ role: "OWNER" }).success, false);
});

test("parseRouteId accepts UUID route params only", () => {
  assert.equal(parseRouteId(routeId), routeId);
  assert.throws(() => parseRouteId("not-a-uuid"));
});
