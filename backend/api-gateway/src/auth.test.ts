import assert from "node:assert/strict";
import test from "node:test";
import {
  auditQuerySchema,
  getRateLimitIdentity,
  hashApiKey,
  hashPassword,
  readApiKey,
  readBearerToken,
  routeParam,
  verifyPassword,
} from "./auth.js";

function request(headers: Record<string, string | undefined>, ip = "127.0.0.1") {
  return {
    ip,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

test("hashApiKey returns a deterministic sha256 hash", () => {
  const apiKey = "sk_test_123";

  assert.equal(hashApiKey(apiKey), hashApiKey(apiKey));
  assert.notEqual(hashApiKey(apiKey), apiKey);
  assert.equal(hashApiKey(apiKey).length, 64);
});

test("password hashes verify correct passwords only", async () => {
  const passwordHash = await hashPassword("correct horse battery staple");

  assert.equal(await verifyPassword("correct horse battery staple", passwordHash), true);
  assert.equal(await verifyPassword("wrong password", passwordHash), false);
  assert.equal(await verifyPassword("correct horse battery staple", "sha256:not-supported"), false);
});

test("readApiKey trims api key headers", () => {
  assert.equal(readApiKey(request({ "x-api-key": "  api-key-value  " })), "api-key-value");
  assert.equal(readApiKey(request({})), undefined);
});

test("readBearerToken accepts Bearer authorization headers", () => {
  assert.equal(readBearerToken(request({ authorization: "Bearer jwt-token" })), "jwt-token");
  assert.equal(readBearerToken(request({ authorization: "Basic token" })), undefined);
  assert.equal(readBearerToken(request({})), undefined);
});

test("getRateLimitIdentity prefers api keys, then bearer tokens, then ip", () => {
  assert.equal(
    getRateLimitIdentity(request({ "x-api-key": "gateway-key", authorization: "Bearer ignored" })),
    `api-key:${hashApiKey("gateway-key")}`,
  );
  assert.equal(getRateLimitIdentity(request({ authorization: "Bearer jwt-token" })), `jwt:${hashApiKey("jwt-token")}`);
  assert.equal(getRateLimitIdentity(request({}, "10.0.0.8")), "ip:10.0.0.8");
});

test("routeParam returns the first route parameter value", () => {
  assert.equal(routeParam("job-1"), "job-1");
  assert.equal(routeParam(["job-1", "job-2"]), "job-1");
  assert.equal(routeParam(undefined), undefined);
});

test("auditQuerySchema coerces supported filters and rejects invalid limits", () => {
  assert.deepEqual(auditQuerySchema.parse({}), { limit: 50 });
  assert.deepEqual(auditQuerySchema.parse({ limit: "25", actorType: "USER", action: "JOB_CREATED" }), {
    limit: 25,
    actorType: "USER",
    action: "JOB_CREATED",
  });
  assert.equal(auditQuerySchema.safeParse({ limit: "101" }).success, false);
  assert.equal(auditQuerySchema.safeParse({ limit: "0" }).success, false);
});
