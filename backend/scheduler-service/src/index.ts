import express from "express";
import amqp from "amqplib";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { nextCronRun } from "./cron.js";

const app = express();
const port = Number(process.env.SCHEDULER_SERVICE_PORT ?? 3003);
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});
const rabbitmqUrl = process.env.RABBITMQ_URL ?? "amqp://scheduler:scheduler@localhost:5672";
const readyQueueName = process.env.EXECUTION_READY_QUEUE ?? "execution.ready";
const deadLetterExchangeName = process.env.EXECUTION_DEAD_LETTER_EXCHANGE ?? "execution.dead";
const deadLetterQueueName = process.env.EXECUTION_DEAD_LETTER_QUEUE ?? "execution.dead";
const pollIntervalMs = Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 5000);
const batchSize = Number(process.env.SCHEDULER_BATCH_SIZE ?? 50);
const schedulerLockKey = process.env.SCHEDULER_LOCK_KEY ?? "scheduler:run-lock";
const schedulerLockTtlMs = Number(process.env.SCHEDULER_LOCK_TTL_MS ?? 30000);

function requestLogger(service: string): express.RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      console.log(
        JSON.stringify({
          level: "info",
          event: "http_request",
          service,
          requestId: res.locals.requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  };
}

function requestIdMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requestId = req.header("x-request-id")?.trim() || randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

app.use(requestIdMiddleware);
app.use(requestLogger("scheduler-service"));
app.use(express.json());

type SchedulerStats = {
  oneTimeQueued: number;
  recurringQueued: number;
  retriesQueued: number;
  pendingQueued: number;
};

let channelPromise: Promise<amqp.Channel> | undefined;
let rabbitConnection: amqp.ChannelModel | undefined;
let schedulerInterval: NodeJS.Timeout | undefined;
let schedulerRunning = false;

const scheduleRunSchema = z.object({
  now: z.coerce.date().optional(),
});

function getChannel() {
  channelPromise ??= amqp.connect(rabbitmqUrl).then(async (connection) => {
    rabbitConnection = connection;
    const channel = await connection.createChannel();
    await channel.assertExchange(deadLetterExchangeName, "direct", { durable: true });
    await channel.assertQueue(deadLetterQueueName, { durable: true });
    await channel.bindQueue(deadLetterQueueName, deadLetterExchangeName, deadLetterQueueName);
    await channel.assertQueue(readyQueueName, {
      durable: true,
      deadLetterExchange: deadLetterExchangeName,
      deadLetterRoutingKey: deadLetterQueueName,
    });

    connection.on("close", () => {
      channelPromise = undefined;
    });

    connection.on("error", () => {
      channelPromise = undefined;
    });

    return channel;
  });

  return channelPromise;
}

async function acquireSchedulerLock() {
  if (redis.status === "wait") {
    await redis.connect();
  }

  const token = randomUUID();
  const acquired = await redis.set(schedulerLockKey, token, "PX", schedulerLockTtlMs, "NX");

  return acquired === "OK" ? token : undefined;
}

async function releaseSchedulerLock(token: string) {
  const currentToken = await redis.get(schedulerLockKey);

  if (currentToken === token) {
    await redis.del(schedulerLockKey);
  }
}

async function runSchedulerOnceWithLock(now = new Date()) {
  const lockToken = await acquireSchedulerLock();

  if (!lockToken) {
    return { acquired: false as const, stats: undefined };
  }

  try {
    const stats = await runSchedulerOnce(now);
    return { acquired: true as const, stats };
  } finally {
    await releaseSchedulerLock(lockToken);
  }
}

async function publishExecution(executionId: string) {
  const channel = await getChannel();
  const payload = Buffer.from(JSON.stringify({ executionId }));

  channel.sendToQueue(readyQueueName, payload, {
    contentType: "application/json",
    deliveryMode: 2,
  });
}

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
          nextRunAt: nextCronRun(lockedSchedule.cronExpression, lockedSchedule.timezone, now),
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
  const [oneTimeQueued, recurringQueued, retriesQueued, pendingQueued] = await Promise.all([
    scheduleDueOneTimeJobs(now),
    scheduleDueRecurringJobs(now),
    scheduleDueRetries(now),
    scheduleDuePendingExecutions(now),
  ]);

  return { oneTimeQueued, recurringQueued, retriesQueued, pendingQueued };
}

async function runSchedulerLoop() {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const result = await runSchedulerOnceWithLock();

    if (!result.acquired) {
      return;
    }

    const stats = result.stats;
    const queued = stats.oneTimeQueued + stats.recurringQueued + stats.retriesQueued + stats.pendingQueued;

    if (queued > 0) {
      console.log(`scheduler queued ${queued} execution(s)`, stats);
    }
  } catch (error) {
    console.error("scheduler loop failed", error);
  } finally {
    schedulerRunning = false;
  }
}

app.get("/health", (_req, res) => {
  res.json({ service: "scheduler-service", status: "ok" });
});

app.post("/schedule/run", async (req, res, next) => {
  try {
    const data = scheduleRunSchema.parse(req.body);
    const result = await runSchedulerOnceWithLock(data.now ?? new Date());

    if (!result.acquired) {
      res.status(409).json({ error: "Scheduler lock is already held" });
      return;
    }

    res.json(result.stats);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", issues: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(409).json({ error: "Scheduling conflict", code: error.code });
      return;
    }

    next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`scheduler-service listening on port ${port}`);
});

schedulerInterval = setInterval(runSchedulerLoop, pollIntervalMs);

async function shutdown(signal: string) {
  console.log(`scheduler-service received ${signal}, shutting down`);
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  server.close(async () => {
    await rabbitConnection?.close();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
