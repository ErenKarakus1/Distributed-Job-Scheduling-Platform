import assert from "node:assert/strict";
import test from "node:test";
import { humanizeCronExpression } from "./cron.js";

test("humanizeCronExpression explains common interval schedules", () => {
  assert.equal(humanizeCronExpression("* * * * *"), "Every minute");
  assert.equal(humanizeCronExpression("*/5 * * * *"), "Every 5 minutes");
  assert.equal(humanizeCronExpression("0 */2 * * *"), "Every 2 hours");
});

test("humanizeCronExpression explains daily and weekly schedules", () => {
  assert.equal(humanizeCronExpression("0 9 * * *"), "Every day at 09:00");
  assert.equal(
    humanizeCronExpression("30 14 * * 1"),
    "Every day at 14:30 on Monday",
  );
  assert.equal(
    humanizeCronExpression("0 9 * * 1,5"),
    "Every day at 09:00 on Monday and Friday",
  );
});

test("humanizeCronExpression handles invalid and advanced expressions", () => {
  assert.equal(
    humanizeCronExpression("not enough"),
    "Enter a five-part cron expression",
  );
  assert.equal(
    humanizeCronExpression("15 9 1 */2 *"),
    "At 09:15 when date matches 1 */2 *",
  );
});
