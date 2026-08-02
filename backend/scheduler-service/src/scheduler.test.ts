import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { createScheduler } from "./scheduler.js";

test("runSchedulerOnce skips when another scheduler owns the advisory lock", async () => {
  let published = 0;
  const prisma = {
    $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
      callback({} as PrismaClient),
  } as unknown as PrismaClient;

  const scheduler = createScheduler({
    prisma,
    batchSize: 10,
    publishExecution: async () => {
      published += 1;
    },
    acquireLock: async () => false,
    releaseLock: async () => {
      throw new Error("release should not be called when lock is not acquired");
    },
  });

  const stats = await scheduler.runSchedulerOnce(
    new Date("2026-08-02T12:00:00.000Z"),
  );

  assert.deepEqual(stats, {
    lockAcquired: false,
    skipped: true,
    oneTimeQueued: 0,
    recurringQueued: 0,
    retriesQueued: 0,
    pendingQueued: 0,
  });
  assert.equal(published, 0);
});
