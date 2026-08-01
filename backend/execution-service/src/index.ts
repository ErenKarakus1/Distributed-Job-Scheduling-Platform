import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const app = express();
const port = Number(process.env.EXECUTION_SERVICE_PORT ?? 3002);
const prisma = new PrismaClient();

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

    const executions = await prisma.execution.findMany({
      where: { status, jobId },
      include: { job: true, attempts: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ data: executions });
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
    const execution = await prisma.execution.update({
      where: { id },
      data: {
        status: "CANCELED",
        lockedByWorkerId: null,
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

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`execution-service listening on port ${port}`);
});
