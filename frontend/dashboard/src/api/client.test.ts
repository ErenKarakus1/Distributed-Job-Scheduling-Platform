import assert from "node:assert/strict";
import test from "node:test";
import { formatApiError } from "./client.js";

test("formatApiError summarizes validation issues with field paths", () => {
  const message = formatApiError(
    { status: 400 },
    {
      error: "Validation failed",
      issues: [
        { path: ["password"], message: "Too big: expected string to have <=200 characters" },
        { path: ["email"], message: "Invalid email address" },
      ],
    },
  );

  assert.equal(message, "password: Too big: expected string to have <=200 characters; email: Invalid email address");
});

test("formatApiError falls back to response errors without issues", () => {
  assert.equal(formatApiError({ status: 409 }, { error: "User already exists" }), "User already exists");
});
