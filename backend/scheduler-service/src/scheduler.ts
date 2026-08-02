import { Prisma, PrismaClient } from "@prisma/client";
import { nextCronRun } from "./cron.js";
import type { SchedulerStats } from "./stats.js";

const schedulerAdvisoryLockId = 4_219_001;

type PublishExecution = (executionId: string) => Promise<void>;
type SchedulerDb = PrismaClient | Prisma.TransactionClient;
type SchedulerPlan = SchedulerStats & {
  executionIds: string[];
};

type SchedulerDependencies = {
  prisma: PrismaClient;
  batchSize: number;
  publishExecution: PublishExecution;
  lockId?: number;
  acquireLock?: () => Promise<boolean>;
  releaseLock?: () => Promise<void>;
};

export function createScheduler(deps: SchedulerDependencies) {
  const {
    prisma,
    batchSize,
    publishExecution,
    lockId = schedulerAdvisoryLockId,
  } = deps;

  async function acquireSchedulerLock(db: SchedulerDb) {
    if (deps.acquireLock) {
      return deps.acquireLock();
    }

    const rows = await db.$queryRaw<
      Array<{ locked: boolean }>
    >`select pg_try_advisory_xact_lock(${lockId}) as locked`;
    return rows[0]?.locked === true;
  }

  async function releaseSchedulerLock() {
    if (deps.releaseLock) {
      await deps.releaseLock();
    }
  }

  async function publishQueuedExecution(executionId: string) {
    await publishExecution(executionId);

    await prisma.execution.updateMany({
      where: {
        id: executionId,
        status: { in: ["PENDING", "RETRY_SCHEDULED", "STALLED"] },
      },
      data: {
        status: "QUEUED",
      },
    });
  }

  async function scheduleDueOneTimeJobs(db: SchedulerDb, now: Date) {
    const jobs = await db.job.findMany({
      where: {
        type: "ONE_TIME",
        status: "ACTIVE",
        runAt: { lte: now },
        executions: { none: {} },
      },
      take: batchSize,
      orderBy: { runAt: "asc" },
    });

    const executionIds: string[] = [];

    for (const job of jobs) {
      const execution = await db.execution.create({
        data: {
          jobId: job.id,
          status: "PENDING",
          scheduledFor: job.runAt ?? now,
          nextAttemptAt: job.runAt ?? now,
        },
      });

      executionIds.push(execution.id);
    }

    return executionIds;
  }

  async function scheduleDueRecurringJobs(db: SchedulerDb, now: Date) {
    const schedules = await db.jobSchedule.findMany({
      where: {
        nextRunAt: { lte: now },
        job: { status: "ACTIVE", type: "RECURRING" },
      },
      include: { job: true },
      take: batchSize,
      orderBy: { nextRunAt: "asc" },
    });

    const executionIds: string[] = [];

    for (const schedule of schedules) {
      const lockedSchedule = await db.jobSchedule.findUnique({
        where: { id: schedule.id },
      });

      if (!lockedSchedule || lockedSchedule.nextRunAt > now) {
        continue;
      }

      const execution = await db.execution.create({
        data: {
          jobId: schedule.jobId,
          status: "PENDING",
          scheduledFor: lockedSchedule.nextRunAt,
          nextAttemptAt: lockedSchedule.nextRunAt,
        },
      });

      await db.jobSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: lockedSchedule.nextRunAt,
          nextRunAt: nextCronRun(
            lockedSchedule.cronExpression,
            lockedSchedule.timezone,
            now,
          ),
        },
      });

      executionIds.push(execution.id);
    }

    return executionIds;
  }

  async function scheduleDueRetries(db: SchedulerDb, now: Date) {
    const executions = await db.execution.findMany({
      where: {
        status: "RETRY_SCHEDULED",
        nextAttemptAt: { lte: now },
        job: { status: "ACTIVE" },
      },
      take: batchSize,
      orderBy: { nextAttemptAt: "asc" },
    });

    return executions.map((execution) => execution.id);
  }

  async function scheduleDuePendingExecutions(db: SchedulerDb, now: Date) {
    const executions = await db.execution.findMany({
      where: {
        status: "PENDING",
        nextAttemptAt: { lte: now },
        job: { status: "ACTIVE" },
      },
      take: batchSize,
      orderBy: { nextAttemptAt: "asc" },
    });

    return executions.map((execution) => execution.id);
  }

  async function runSchedulerOnce(now = new Date()): Promise<SchedulerStats> {
    const plan = await prisma.$transaction(async (tx): Promise<SchedulerPlan> => {
      const lockAcquired = await acquireSchedulerLock(tx);

      if (!lockAcquired) {
        return {
          lockAcquired,
          skipped: true,
          oneTimeQueued: 0,
          recurringQueued: 0,
          retriesQueued: 0,
          pendingQueued: 0,
          executionIds: [],
        };
      }

      try {
        const [oneTimeIds, recurringIds, retryIds, pendingIds] =
          await Promise.all([
            scheduleDueOneTimeJobs(tx, now),
            scheduleDueRecurringJobs(tx, now),
            scheduleDueRetries(tx, now),
            scheduleDuePendingExecutions(tx, now),
          ]);

        return {
          lockAcquired,
          skipped: false,
          oneTimeQueued: oneTimeIds.length,
          recurringQueued: recurringIds.length,
          retriesQueued: retryIds.length,
          pendingQueued: pendingIds.length,
          executionIds: [
            ...oneTimeIds,
            ...recurringIds,
            ...retryIds,
            ...pendingIds,
          ],
        };
      } finally {
        await releaseSchedulerLock();
      }
    });

    for (const executionId of plan.executionIds) {
      await publishQueuedExecution(executionId);
    }

    const { executionIds: _executionIds, ...stats } = plan;
    return stats;
  }

  return { runSchedulerOnce };
}
