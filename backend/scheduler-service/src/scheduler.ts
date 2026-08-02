import { PrismaClient } from "@prisma/client";
import { nextCronRun } from "./cron.js";
import type { SchedulerStats } from "./stats.js";

type PublishExecution = (executionId: string) => Promise<void>;

type SchedulerDependencies = {
  prisma: PrismaClient;
  batchSize: number;
  publishExecution: PublishExecution;
};

export function createScheduler(deps: SchedulerDependencies) {
  const { prisma, batchSize, publishExecution } = deps;

  async function queueExecution(executionId: string) {
    await publishExecution(executionId);

    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "QUEUED" },
    });
  }

  async function scheduleDueOneTimeJobs(now: Date) {
    const jobs = await prisma.job.findMany({
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
      const execution = await prisma.execution.create({
        data: {
          jobId: job.id,
          status: "PENDING",
          scheduledFor: job.runAt ?? now,
          nextAttemptAt: job.runAt ?? now,
        },
      });

      await queueExecution(execution.id);
    }

    return jobs.length;
  }

  async function scheduleDueRecurringJobs(now: Date) {
    const schedules = await prisma.jobSchedule.findMany({
      where: {
        nextRunAt: { lte: now },
        job: { status: "ACTIVE", type: "RECURRING" },
      },
      include: { job: true },
      take: batchSize,
      orderBy: { nextRunAt: "asc" },
    });

    for (const schedule of schedules) {
      const executionId = await prisma.$transaction(async (tx) => {
        const lockedSchedule = await tx.jobSchedule.findUnique({
          where: { id: schedule.id },
        });

        if (!lockedSchedule || lockedSchedule.nextRunAt > now) {
          return undefined;
        }

        const execution = await tx.execution.create({
          data: {
            jobId: schedule.jobId,
            status: "PENDING",
            scheduledFor: lockedSchedule.nextRunAt,
            nextAttemptAt: lockedSchedule.nextRunAt,
          },
        });

        await tx.jobSchedule.update({
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

        return execution.id;
      });

      if (executionId) {
        await queueExecution(executionId);
      }
    }

    return schedules.length;
  }

  async function scheduleDueRetries(now: Date) {
    const executions = await prisma.execution.findMany({
      where: {
        status: "RETRY_SCHEDULED",
        nextAttemptAt: { lte: now },
        job: { status: "ACTIVE" },
      },
      take: batchSize,
      orderBy: { nextAttemptAt: "asc" },
    });

    for (const execution of executions) {
      await queueExecution(execution.id);
    }

    return executions.length;
  }

  async function scheduleDuePendingExecutions(now: Date) {
    const executions = await prisma.execution.findMany({
      where: {
        status: "PENDING",
        nextAttemptAt: { lte: now },
        job: { status: "ACTIVE" },
      },
      take: batchSize,
      orderBy: { nextAttemptAt: "asc" },
    });

    for (const execution of executions) {
      await queueExecution(execution.id);
    }

    return executions.length;
  }

  async function runSchedulerOnce(now = new Date()): Promise<SchedulerStats> {
    const [oneTimeQueued, recurringQueued, retriesQueued, pendingQueued] =
      await Promise.all([
        scheduleDueOneTimeJobs(now),
        scheduleDueRecurringJobs(now),
        scheduleDueRetries(now),
        scheduleDuePendingExecutions(now),
      ]);

    return { oneTimeQueued, recurringQueued, retriesQueued, pendingQueued };
  }

  return { runSchedulerOnce };
}
