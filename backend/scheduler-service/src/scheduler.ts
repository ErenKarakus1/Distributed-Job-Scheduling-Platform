import { Prisma, PrismaClient } from "@prisma/client";
import { nextCronRun } from "./cron.js";
import type { SchedulerStats } from "./stats.js";

const schedulerAdvisoryLockId = 4_219_001;

type PublishExecution = (executionId: string) => Promise<void>;
type SchedulerDb = PrismaClient | Prisma.TransactionClient;

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

  async function queueExecution(db: SchedulerDb, executionId: string) {
    await publishExecution(executionId);

    await db.execution.update({
      where: { id: executionId },
      data: { status: "QUEUED" },
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

    for (const job of jobs) {
      const execution = await db.execution.create({
        data: {
          jobId: job.id,
          status: "PENDING",
          scheduledFor: job.runAt ?? now,
          nextAttemptAt: job.runAt ?? now,
        },
      });

      await queueExecution(db, execution.id);
    }

    return jobs.length;
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

      await queueExecution(db, execution.id);
    }

    return schedules.length;
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

    for (const execution of executions) {
      await queueExecution(db, execution.id);
    }

    return executions.length;
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

    for (const execution of executions) {
      await queueExecution(db, execution.id);
    }

    return executions.length;
  }

  async function runSchedulerOnce(now = new Date()): Promise<SchedulerStats> {
    return prisma.$transaction(async (tx) => {
      const lockAcquired = await acquireSchedulerLock(tx);

      if (!lockAcquired) {
        return {
          lockAcquired,
          skipped: true,
          oneTimeQueued: 0,
          recurringQueued: 0,
          retriesQueued: 0,
          pendingQueued: 0,
        };
      }

      try {
        const [oneTimeQueued, recurringQueued, retriesQueued, pendingQueued] =
          await Promise.all([
            scheduleDueOneTimeJobs(tx, now),
            scheduleDueRecurringJobs(tx, now),
            scheduleDueRetries(tx, now),
            scheduleDuePendingExecutions(tx, now),
          ]);

        return {
          lockAcquired,
          skipped: false,
          oneTimeQueued,
          recurringQueued,
          retriesQueued,
          pendingQueued,
        };
      } finally {
        await releaseSchedulerLock();
      }
    });
  }

  return { runSchedulerOnce };
}
