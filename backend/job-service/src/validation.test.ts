import assert from "node:assert/strict";
import test from "node:test";
import {
  createJobSchema,
  paginationSchema,
  parseId,
  updateJobSchema,
} from "./validation.js";

const baseJob = {
  name: "Ping",
  method: "POST",
  url: "https://example.com/webhook",
};

test("createJobSchema accepts valid one-time jobs", () => {
  const result = createJobSchema.parse({
    ...baseJob,
    type: "ONE_TIME",
    runAt: "2026-08-02T12:00:00.000Z",
  });

  assert.equal(result.type, "ONE_TIME");
  assert.ok(result.runAt instanceof Date);
});

test("createJobSchema requires runAt for one-time jobs", () => {
  const result = createJobSchema.safeParse({
    ...baseJob,
    type: "ONE_TIME",
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.path.join("."), "runAt");
});

test("createJobSchema validates recurring cron expressions", () => {
  const result = createJobSchema.safeParse({
    ...baseJob,
    type: "RECURRING",
    schedule: {
      cronExpression: "not a cron",
      timezone: "UTC",
      nextRunAt: "2026-08-02T12:00:00.000Z",
    },
  });

  assert.equal(result.success, false);
  assert.equal(
    result.error.issues[0]?.path.join("."),
    "schedule.cronExpression",
  );
  assert.equal(
    result.error.issues[0]?.message,
    "cronExpression must be a valid cron expression",
  );
});

test("createJobSchema reports invalid recurring timezones on the timezone field", () => {
  const result = createJobSchema.safeParse({
    ...baseJob,
    type: "RECURRING",
    schedule: {
      cronExpression: "*/5 * * * *",
      timezone: "Not/A_Timezone",
      nextRunAt: "2026-08-02T12:00:00.000Z",
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.path.join("."), "schedule.timezone");
  assert.equal(
    result.error.issues[0]?.message,
    "timezone must be a valid IANA timezone, such as UTC or Europe/Istanbul",
  );
});

test("createJobSchema rejects retry delay ranges that cannot back off", () => {
  const result = createJobSchema.safeParse({
    ...baseJob,
    type: "ONE_TIME",
    runAt: "2026-08-02T12:00:00.000Z",
    retryInitialDelayMs: 5000,
    retryMaxDelayMs: 1000,
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.path.join("."), "retryInitialDelayMs");
});

test("updateJobSchema rejects retry delay ranges that cannot back off", () => {
  const result = updateJobSchema.safeParse({
    retryInitialDelayMs: 5000,
    retryMaxDelayMs: 1000,
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.path.join("."), "retryInitialDelayMs");
});

test("updateJobSchema rejects retry ranges when max delay is zero", () => {
  const result = updateJobSchema.safeParse({
    retryInitialDelayMs: 1,
    retryMaxDelayMs: 0,
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.path.join("."), "retryInitialDelayMs");
});

test("updateJobSchema rejects direct soft-delete status updates", () => {
  const result = updateJobSchema.safeParse({ status: "DELETED" });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.path.join("."), "status");
});

test("paginationSchema coerces defaults and caps page size", () => {
  assert.deepEqual(paginationSchema.parse({}), { limit: 25, offset: 0 });

  const result = paginationSchema.safeParse({ limit: "101", offset: "0" });
  assert.equal(result.success, false);
});

test("parseId accepts UUID route params only", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  assert.equal(parseId(id), id);
  assert.throws(() => parseId("not-a-uuid"));
});
