import assert from "node:assert/strict";
import test from "node:test";
import { parseBootstrapAdminInput } from "./bootstrap-admin.js";

test("parseBootstrapAdminInput normalizes valid admin credentials", () => {
  const input = parseBootstrapAdminInput({
    ADMIN_EMAIL: "Admin@Example.COM",
    ADMIN_NAME: "Root Admin",
    ADMIN_PASSWORD: "super-secret",
  });

  assert.deepEqual(input, {
    email: "admin@example.com",
    name: "Root Admin",
    password: "super-secret",
  });
});

test("parseBootstrapAdminInput defaults the admin name", () => {
  const input = parseBootstrapAdminInput({
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD: "super-secret",
  });

  assert.equal(input.name, "Platform Admin");
});

test("parseBootstrapAdminInput rejects missing or weak credentials", () => {
  assert.equal(parseResult({ ADMIN_PASSWORD: "super-secret" }), false);
  assert.equal(parseResult({ ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "short" }), false);
  assert.equal(parseResult({ ADMIN_EMAIL: "not-an-email", ADMIN_PASSWORD: "super-secret" }), false);
});

function parseResult(env: NodeJS.ProcessEnv) {
  return safe(() => parseBootstrapAdminInput(env));
}

function safe(action: () => unknown) {
  try {
    action();
    return true;
  } catch {
    return false;
  }
}
