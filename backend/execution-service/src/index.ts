import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";

const app = express();
const port = Number(process.env.EXECUTION_SERVICE_PORT ?? 3002);
const prisma = new PrismaClient();
const stalledAfterMs = Number(process.env.EXECUTION_STALLED_AFTER_MS ?? 60000);
const recoveryIntervalMs = Number(process.env.EXECUTION_RECOVERY_INTERVAL_MS ?? 15000);
const recoveryBatchSize = Number(process.env.EXECUTION_RECOVERY_BATCH_SIZE ?? 50);
let recoveryRunning = false;
let recoveryInterval: NodeJS.Timeout | undefined;

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
app.use(requestLogger("execution-service"));
app.use(express.json());

const executionStatusSchema = z.enum([
  "PENDING",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "RETRY_SCHEDULED",
  "STALLED",
  "CANCELED",
]);
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const attemptStatusSchema = z.enum(["RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"]);

const createExecutionSchema = z.object({
  jobId: z.string().uuid(),
  scheduledFor: z.coerce.date(),
});

const markQueuedSchema = z.object({
  queuedAt: z.coerce.date().optional(),
});

const markRunningSchema = z.object({
  workerId: z.string().uuid(),
  startedAt: z.coerce.date().optional(),
});

const heartbeatSchema = z.object({
  workerId: z.string().uuid(),
  heartbeatAt: z.coerce.date().optional(),
});

const recordAttemptSchema = z.object({
  workerId: z.string().uuid().optional(),
  status: attemptStatusSchema,
  httpStatusCode: z.number().int().min(100).max(599).optional(),
  responseBodyPreview: z.string().max(4000).optional(),
  errorMessage: z.string().max(4000).optional(),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
  durationMs: z.number().int().min(0).optional(),
});

const recoverStalledSchema = z.object({
  now: z.coerce.date().optional(),
});

function parseId(id: string) {
  return z.string().uuid().parse(id);
}

function sendValidationError(res: express.Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation failed", issues: error.issues });
    return true;
  }

  return false;
}

function calculateBackoffDelayMs(job: {
  backoffType: "FIXED" | "EXPONENTIAL";
  retryInitialDelayMs: number;
  retryMaxDelayMs: number;
}, nextAttemptNumber: number) {
  const baseDelay = job.retryInitialDelayMs;
  const delay =
    job.backoffType === "EXPONENTIAL"
      ? baseDelay * 2 ** Math.max(nextAttemptNumber - 2, 0)
      : baseDelay;

  return Math.min(delay, job.retryMaxDelayMs);
}

async function recoverStalledExecutions(now = new Date()) {
  const staleBefore = new Date(now.getTime() - stalledAfterMs);
  const stalledExecutions = await prisma.execution.findMany({
    where: {
      status: "RUNNING",
      lastHeartbeatAt: { lt: staleBefore },
    },
    include: { job: true },
    orderBy: { lastHeartbeatAt: "asc" },
    take: recoveryBatchSize,
  });

  let retryScheduled = 0;
  let failed = 0;

  for (const execution of stalledExecutions) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.execution.findUnique({
        where: { id: execution.id },
        include: { job: true },
      });

      if (!current || current.status !== "RUNNING" || !current.lastHeartbeatAt || current.lastHeartbeatAt >= staleBefore) {
        return;
      }

      const attemptNumber = current.attemptCount + 1;
      const retryable = attemptNumber < current.job.maxAttempts;
      const nextAttemptAt = retryable
        ? new Date(now.getTime() + calculateBackoffDelayMs(current.job, attemptNumber + 1))
        : null;

      await tx.executionAttempt.create({
        data: {
          executionId: current.id,
          attemptNumber,
          workerId: current.lockedByWorkerId,
          status: "FAILED",
          errorMessage: `Execution stalled after ${stalledAfterMs}ms without heartbeat`,
          startedAt: current.startedAt ?? current.lastHeartbeatAt,
          finishedAt: now,
          durationMs: current.startedAt ? now.getTime() - current.startedAt.getTime() : undefined,
        },
      });

      await tx.execution.update({
        where: { id: current.id },
        data: {
          attemptCount: attemptNumber,
          status: retryable ? "RETRY_SCHEDULED" : "FAILED",
          nextAttemptAt,
          lockedByWorkerId: null,
          finishedAt: retryable ? null : now,
        },
      });

      if (retryable) {
        retryScheduled += 1;
      } else {
        failed += 1;
      }
    });
  }

  return {
    scanned: stalledExecutions.length,
    retryScheduled,
    failed,
    staleBefore,
  };
}

async function runRecoveryLoop() {
  if (recoveryRunning) {
    return;
  }

  recoveryRunning = true;

  try {
    const stats = await recoverStalledExecutions();

    if (stats.scanned > 0) {
      console.log("recovered stalled executions", stats);
    }
  } catch (error) {
    console.error("stalled execution recovery failed", error);
  } finally {
    recoveryRunning = false;
  }
}

app.get("/health", (_req, res) => {
  res.json({ service: "execution-service", status: "ok" });
});

app.post("/executions", async (req, res, next) => {
  try {
    const data = createExecutionSchema.parse(req.body);

    const execution = await prisma.execution.create({
      data: {
        jobId: data.jobId,
        scheduledFor: data.scheduledFor,
        nextAttemptAt: data.scheduledFor,
      },
      include: { job: true, attempts: true },
    });

    res.status(201).json(execution);
  } catch (error) {
    if (!sendValidationError(res, error)) next(error);
  }
});

app.get("/executions", async (req, res, next) => {
  try {
    const status = req.query.status ? executionStatusSchema.parse(req.query.status) : undefined;
    const jobId = req.query.jobId ? parseId(String(req.query.jobId)) : undefined;
    const pagination = paginationSchema.parse(req.query);

    const where = { status, jobId };
    const [executions, total] = await Promise.all([
      prisma.execution.findMany({
        where,
        include: { job: true, attempts: true },
        orderBy: { createdAt: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      prisma.execution.count({ where }),
    ]);

    res.json({ data: executions, page: { ...pagination, total } });
  } catch (error) {
    if (!sendValidationError(res, error)) next(error);
  }
});

app.get("/executions/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const execution = await prisma.execution.findUnique({
      where: { id },
      include: { job: true, attempts: true },
    });

    if (!execution) {
      res.status(404).json({ error: "Execution not found" });
      return;
    }

    res.json(execution);
  } catch (error) {
    if (!sendValidationError(res, error)) next(error);
  }
});

app.get("/workers", async (req, res, next) => {
  try {
    const pagination = paginationSchema.parse(req.query);
    const [workers, total] = await Promise.all([
      prisma.worker.findMany({
        orderBy: { lastHeartbeatAt: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      prisma.worker.count(),
    ]);

    res.json({ data: workers, page: { ...pagination, total } });
  } catch (error) {
    next(error);
  }
});

app.get("/metrics/overview", async (_req, res, next) => {
  try {
    const [
      totalJobs,
      activeJobs,
      pausedJobs,
      runningExecutions,
      queuedExecutions,
      retryScheduledExecutions,
      failedExecutions,
      succeededExecutions,
      activeWorkers,
    ] = await Promise.all([
      prisma.job.count({ where: { status: { not: "DELETED" } } }),
      prisma.job.count({ where: { status: "ACTIVE" } }),
      prisma.job.count({ where: { status: "PAUSED" } }),
      prisma.execution.count({ where: { status: "RUNNING" } }),
      prisma.execution.count({ where: { status: "QUEUED" } }),
      prisma.execution.count({ where: { status: "RETRY_SCHEDULED" } }),
      prisma.execution.count({ where: { status: "FAILED" } }),
      prisma.execution.count({ where: { status: "SUCCEEDED" } }),
      prisma.worker.count({ where: { status: { in: ["IDLE", "BUSY"] } } }),
    ]);

    res.json({
      jobs: {
        total: totalJobs,
        active: activeJobs,
        paused: pausedJobs,
      },
      executions: {
        running: runningExecutions,
        queued: queuedExecutions,
        retryScheduled: retryScheduledExecutions,
        failed: failedExecutions,
        succeeded: succeededExecutions,
      },
      workers: {
        active: activeWorkers,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/executions/:id/mark-queued", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    markQueuedSchema.parse(req.body);

    const execution = await prisma.execution.update({
      where: { id },
      data: { status: "QUEUED" },
      include: { job: true, attempts: true },
    });

    res.json(execution);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Execution not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/executions/:id/mark-running", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const data = markRunningSchema.parse(req.body);
    const startedAt = data.startedAt ?? new Date();

    const execution = await prisma.execution.update({
      where: { id },
      data: {
        status: "RUNNING",
        lockedByWorkerId: data.workerId,
        startedAt,
        lastHeartbeatAt: startedAt,
      },
      include: { job: true, attempts: true },
    });

    res.json(execution);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Execution not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/executions/:id/heartbeat", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const data = heartbeatSchema.parse(req.body);

    const execution = await prisma.execution.update({
      where: {
        id,
        lockedByWorkerId: data.workerId,
      },
      data: { lastHeartbeatAt: data.heartbeatAt ?? new Date() },
    });

    res.json(execution);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Running execution not found for worker" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/executions/:id/attempts", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const data = recordAttemptSchema.parse(req.body);
    const finishedAt = data.finishedAt ?? new Date();

    const result = await prisma.$transaction(async (tx) => {
      const execution = await tx.execution.findUnique({
        where: { id },
        include: { job: true },
      });

      if (!execution) {
        throw new Error("EXECUTION_NOT_FOUND");
      }

      const attemptNumber = execution.attemptCount + 1;
      const attempt = await tx.executionAttempt.create({
        data: {
          executionId: execution.id,
          attemptNumber,
          workerId: data.workerId,
          status: data.status,
          httpStatusCode: data.httpStatusCode,
          responseBodyPreview: data.responseBodyPreview,
          errorMessage: data.errorMessage,
          startedAt: data.startedAt ?? execution.startedAt ?? new Date(),
          finishedAt,
          durationMs: data.durationMs,
        },
      });

      const succeeded = data.status === "SUCCEEDED";
      const retryable = !succeeded && attemptNumber < execution.job.maxAttempts;
      const nextAttemptAt = retryable
        ? new Date(finishedAt.getTime() + calculateBackoffDelayMs(execution.job, attemptNumber + 1))
        : null;

      const updatedExecution = await tx.execution.update({
        where: { id },
        data: {
          attemptCount: attemptNumber,
          status: succeeded ? "SUCCEEDED" : retryable ? "RETRY_SCHEDULED" : "FAILED",
          nextAttemptAt,
          lockedByWorkerId: null,
          finishedAt: succeeded || !retryable ? finishedAt : null,
        },
        include: { job: true, attempts: true },
      });

      return { execution: updatedExecution, attempt };
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "EXECUTION_NOT_FOUND") {
      res.status(404).json({ error: "Execution not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/executions/:id/cancel", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    const existing = await prisma.execution.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: "Execution not found" });
      return;
    }

    if (["SUCCEEDED", "FAILED", "CANCELED"].includes(existing.status)) {
      res.status(409).json({ error: `Execution is already ${existing.status}` });
      return;
    }

    const execution = await prisma.execution.update({
      where: { id, status: existing.status },
      data: {
        status: "CANCELED",
        lockedByWorkerId: null,
        nextAttemptAt: null,
        finishedAt: new Date(),
      },
      include: { job: true, attempts: true },
    });

    res.json(execution);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Execution not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/recover/stalled", async (req, res, next) => {
  try {
    const data = recoverStalledSchema.parse(req.body);
    const stats = await recoverStalledExecutions(data.now ?? new Date());

    res.json(stats);
  } catch (error) {
    if (!sendValidationError(res, error)) next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`execution-service listening on port ${port}`);
});

recoveryInterval = setInterval(runRecoveryLoop, recoveryIntervalMs);

async function shutdown(signal: string) {
  console.log(`execution-service received ${signal}, shutting down`);
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
  }

  server.close(async () => {
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
