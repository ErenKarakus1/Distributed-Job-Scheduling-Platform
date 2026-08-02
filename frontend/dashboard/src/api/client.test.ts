import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, formatApiError, readJsonResponse } from "./client.js";

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

test("readJsonResponse accepts empty success responses", async () => {
  const body = await readJsonResponse(new Response(null, { status: 204 }));

  assert.equal(body, undefined);
});

test("readJsonResponse parses JSON error responses", async () => {
  await assert.rejects(
    readJsonResponse(new Response(JSON.stringify({ error: "API key not found" }), { status: 404 })),
    (error) => error instanceof ApiError && error.message === "API key not found",
  );
});
