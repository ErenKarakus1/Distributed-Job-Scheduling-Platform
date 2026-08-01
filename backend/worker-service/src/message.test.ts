import assert from "node:assert/strict";
import test from "node:test";
import { MalformedExecutionMessageError, normalizeHeaders, parseExecutionMessageContent, previewResponseBody } from "./message.js";

const executionId = "9b9e3d27-b53c-4a2b-9f47-6ef0a66d3a48";

test("parseExecutionMessageContent accepts valid execution messages", () => {
  const payload = parseExecutionMessageContent(JSON.stringify({ executionId }));

  assert.deepEqual(payload, { executionId });
});

test("parseExecutionMessageContent rejects malformed JSON", () => {
  assert.throws(() => parseExecutionMessageContent("{"), MalformedExecutionMessageError);
});

test("parseExecutionMessageContent rejects invalid payloads", () => {
  assert.throws(() => parseExecutionMessageContent(JSON.stringify({ executionId: "not-a-uuid" })), MalformedExecutionMessageError);
});

test("normalizeHeaders keeps primitive header values only", () => {
  assert.deepEqual(normalizeHeaders({ a: "one", b: 2, c: true, d: null, e: { nested: true } }), {
    a: "one",
    b: 2,
    c: true,
  });
});

test("previewResponseBody stringifies and truncates response bodies", () => {
  assert.equal(previewResponseBody({ hello: "world" }, 12), "{\"hello\":\"wo");
  assert.equal(previewResponseBody("abcdef", 3), "abc");
  assert.equal(previewResponseBody(null, 3), undefined);
});
