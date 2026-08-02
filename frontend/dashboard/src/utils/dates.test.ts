import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTime } from "./dates.js";

test("formatDateTime formats ISO timestamps for dashboard display", () => {
  assert.notEqual(
    formatDateTime("2026-08-02T02:25:28.629Z"),
    "2026-08-02T02:25:28.629Z",
  );
});

test("formatDateTime handles empty and invalid values", () => {
  assert.equal(formatDateTime(null), "-");
  assert.equal(formatDateTime(undefined), "-");
  assert.equal(formatDateTime("not-a-date"), "not-a-date");
});
