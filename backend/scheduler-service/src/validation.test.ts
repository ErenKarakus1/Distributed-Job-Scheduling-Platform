import assert from "node:assert/strict";
import test from "node:test";
import { scheduleRunSchema } from "./validation.js";

test("scheduleRunSchema allows an omitted run time", () => {
  assert.deepEqual(scheduleRunSchema.parse({}), {});
});

test("scheduleRunSchema coerces valid run times", () => {
  const result = scheduleRunSchema.parse({ now: "2026-08-02T12:00:00.000Z" });

  assert.equal(result.now?.toISOString(), "2026-08-02T12:00:00.000Z");
});

test("scheduleRunSchema rejects invalid run times", () => {
  assert.equal(scheduleRunSchema.safeParse({ now: "not-a-date" }).success, false);
});
