import assert from "node:assert/strict";
import test from "node:test";
import { environmentSchema, loadEnvironment } from "./index.js";

const validEnv = {
  DATABASE_URL: "postgresql://scheduler:scheduler@localhost:5432/scheduler",
  RABBITMQ_URL: "amqp://scheduler:scheduler@localhost:5672",
  REDIS_URL: "redis://localhost:6379",
};

test("loadEnvironment applies the development NODE_ENV default", () => {
  const env = loadEnvironment(validEnv);

  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.DATABASE_URL, validEnv.DATABASE_URL);
  assert.equal(env.RABBITMQ_URL, validEnv.RABBITMQ_URL);
  assert.equal(env.REDIS_URL, validEnv.REDIS_URL);
});

test("environmentSchema accepts supported NODE_ENV values", () => {
  assert.equal(environmentSchema.parse({ ...validEnv, NODE_ENV: "test" }).NODE_ENV, "test");
  assert.equal(environmentSchema.parse({ ...validEnv, NODE_ENV: "production" }).NODE_ENV, "production");
});

test("loadEnvironment rejects missing required service URLs", () => {
  assert.equal(environmentSchema.safeParse({ RABBITMQ_URL: validEnv.RABBITMQ_URL, REDIS_URL: validEnv.REDIS_URL }).success, false);
  assert.equal(environmentSchema.safeParse({ DATABASE_URL: validEnv.DATABASE_URL, REDIS_URL: validEnv.REDIS_URL }).success, false);
  assert.equal(environmentSchema.safeParse({ DATABASE_URL: validEnv.DATABASE_URL, RABBITMQ_URL: validEnv.RABBITMQ_URL }).success, false);
});

test("loadEnvironment rejects malformed URLs and unsupported NODE_ENV values", () => {
  assert.equal(environmentSchema.safeParse({ ...validEnv, DATABASE_URL: "not-a-url" }).success, false);
  assert.equal(environmentSchema.safeParse({ ...validEnv, NODE_ENV: "staging" }).success, false);
});
