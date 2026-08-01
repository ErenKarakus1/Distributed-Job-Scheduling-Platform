import assert from "node:assert/strict";
import test from "node:test";
import { AxiosError } from "axios";
import { calculateBackoffDelayMs, getAttemptStatus, getAxiosErrorMessage } from "./execution.js";

test("getAttemptStatus treats axios timeouts as timed out attempts", () => {
  assert.equal(getAttemptStatus(new AxiosError("timeout", "ECONNABORTED")), "TIMED_OUT");
  assert.equal(getAttemptStatus(new AxiosError("bad gateway", "ERR_BAD_RESPONSE")), "FAILED");
  assert.equal(getAttemptStatus(new Error("plain failure")), "FAILED");
});

test("getAxiosErrorMessage prefers axios and Error messages", () => {
  assert.equal(getAxiosErrorMessage(new AxiosError("timeout", "ECONNABORTED")), "timeout");
  assert.equal(getAxiosErrorMessage(new Error("plain failure")), "plain failure");
  assert.equal(getAxiosErrorMessage("nope"), "Unknown worker execution error");
});

test("calculateBackoffDelayMs supports fixed delays", () => {
  assert.equal(
    calculateBackoffDelayMs(
      {
        backoffType: "FIXED",
        retryInitialDelayMs: 1000,
        retryMaxDelayMs: 10000,
      },
      5,
    ),
    1000,
  );
});

test("calculateBackoffDelayMs supports capped exponential delays", () => {
  assert.equal(
    calculateBackoffDelayMs(
      {
        backoffType: "EXPONENTIAL",
        retryInitialDelayMs: 1000,
        retryMaxDelayMs: 6000,
      },
      4,
    ),
    4000,
  );
  assert.equal(
    calculateBackoffDelayMs(
      {
        backoffType: "EXPONENTIAL",
        retryInitialDelayMs: 1000,
        retryMaxDelayMs: 6000,
      },
      10,
    ),
    6000,
  );
});
