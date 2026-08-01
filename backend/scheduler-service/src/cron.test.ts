import assert from "node:assert/strict";
import test from "node:test";
import { nextCronRun } from "./cron.js";

test("nextCronRun advances minute schedules in UTC", () => {
  const next = nextCronRun("*/5 * * * *", "UTC", new Date("2026-08-02T12:01:30.000Z"));

  assert.equal(next.toISOString(), "2026-08-02T12:05:00.000Z");
});

test("nextCronRun respects named timezones", () => {
  const next = nextCronRun("0 9 * * *", "Europe/Istanbul", new Date("2026-08-02T05:30:00.000Z"));

  assert.equal(next.toISOString(), "2026-08-02T06:00:00.000Z");
});

test("nextCronRun throws for invalid cron expressions", () => {
  assert.throws(() => nextCronRun("not a cron", "UTC", new Date("2026-08-02T12:00:00.000Z")));
});
