import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { CronExpressionParser } from "cron-parser";
import { randomUUID } from "node:crypto";

const app = express();
const port = Number(process.env.JOB_SERVICE_PORT ?? 3001);
const prisma = new PrismaClient();

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
app.use(requestLogger("job-service"));
app.use(express.json());

const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const jobTypeSchema = z.enum(["ONE_TIME", "RECURRING"]);
const jobStatusSchema = z.enum(["ACTIVE", "PAUSED", "DELETED"]);
const backoffTypeSchema = z.enum(["FIXED", "EXPONENTIAL"]);
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const jsonValueSchema = z.unknown().transform((value) => value as Prisma.InputJsonValue);

function isValidCronExpression(cronExpression: string, timezone: string) {
  try {
    CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    return true;
  } catch {
    return false;
  }
}

const jobPayloadSchema = z.object({
    name: z.string().min(1).max(200),
    type: jobTypeSchema,
    method: httpMethodSchema,
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    body: jsonValueSchema.optional(),
    timeoutMs: z.number().int().min(100).max(300000).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    backoffType: backoffTypeSchema.optional(),
    retryInitialDelayMs: z.number().int().min(0).max(3600000).optional(),
    retryMaxDelayMs: z.number().int().min(0).max(86400000).optional(),
    runAt: z.coerce.date().optional(),
    schedule: z
      .object({
        cronExpression: z.string().min(1).max(120),
        timezone: z.string().min(1).max(80).default("UTC"),
        nextRunAt: z.coerce.date(),
      })
      .optional(),
  });

const createJobSchema = jobPayloadSchema
  .superRefine((job, ctx) => {
    if (job.type === "ONE_TIME" && !job.runAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runAt is required for ONE_TIME jobs",
        path: ["runAt"],
      });
    }

    if (job.type === "RECURRING" && !job.schedule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "schedule is required for RECURRING jobs",
        path: ["schedule"],
      });
    }

    if (job.schedule && !isValidCronExpression(job.schedule.cronExpression, job.schedule.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cronExpression is invalid for the provided timezone",
        path: ["schedule", "cronExpression"],
      });
    }
  });

const updateJobSchema = jobPayloadSchema
  .partial()
  .extend({
    status: jobStatusSchema.optional(),
  })
  .superRefine((job, ctx) => {
    if (job.retryInitialDelayMs && job.retryMaxDelayMs && job.retryInitialDelayMs > job.retryMaxDelayMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "retryInitialDelayMs must be less than or equal to retryMaxDelayMs",
        path: ["retryInitialDelayMs"],
      });
    }

    if (job.schedule && !isValidCronExpression(job.schedule.cronExpression, job.schedule.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cronExpression is invalid for the provided timezone",
        path: ["schedule", "cronExpression"],
      });
    }
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

app.get("/health", (_req, res) => {
  res.json({ service: "job-service", status: "ok" });
});

app.post("/jobs", async (req, res, next) => {
  try {
    const data = createJobSchema.parse(req.body);

    const job = await prisma.job.create({
      data: {
        name: data.name,
        type: data.type,
        method: data.method,
        url: data.url,
        headers: data.headers,
        body: data.body,
        timeoutMs: data.timeoutMs,
        maxAttempts: data.maxAttempts,
        backoffType: data.backoffType,
        retryInitialDelayMs: data.retryInitialDelayMs,
        retryMaxDelayMs: data.retryMaxDelayMs,
        runAt: data.runAt,
        schedule: data.schedule
          ? {
              create: {
                cronExpression: data.schedule.cronExpression,
                timezone: data.schedule.timezone,
                nextRunAt: data.schedule.nextRunAt,
              },
            }
          : undefined,
      },
      include: { schedule: true },
    });

    res.status(201).json(job);
  } catch (error) {
    if (!sendValidationError(res, error)) next(error);
  }
});

app.get("/jobs", async (req, res, next) => {
  try {
    const status = req.query.status ? jobStatusSchema.parse(req.query.status) : undefined;
    const pagination = paginationSchema.parse(req.query);

    const where = { status };
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: { schedule: true },
        orderBy: { createdAt: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      prisma.job.count({ where }),
    ]);

    res.json({ data: jobs, page: { ...pagination, total } });
  } catch (error) {
    if (!sendValidationError(res, error)) next(error);
  }
});

app.get("/jobs/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const job = await prisma.job.findUnique({
      where: { id },
      include: { schedule: true },
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(job);
  } catch (error) {
    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/jobs/:id/run", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const scheduledFor = new Date();

    const execution = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({
        where: { id },
      });

      if (!job || job.status === "DELETED") {
        throw new Error("JOB_NOT_FOUND");
      }

      if (job.status === "PAUSED") {
        throw new Error("JOB_PAUSED");
      }

      return tx.execution.create({
        data: {
          jobId: id,
          status: "PENDING",
          scheduledFor,
          nextAttemptAt: scheduledFor,
        },
        include: { job: true, attempts: true },
      });
    });

    res.status(201).json(execution);
  } catch (error) {
    if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (error instanceof Error && error.message === "JOB_PAUSED") {
      res.status(409).json({ error: "Paused jobs cannot be run manually" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/jobs/:id/pause", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const job = await prisma.job.update({
      where: { id },
      data: { status: "PAUSED" },
      include: { schedule: true },
    });

    res.json(job);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.post("/jobs/:id/resume", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const job = await prisma.job.update({
      where: { id },
      data: { status: "ACTIVE" },
      include: { schedule: true },
    });

    res.json(job);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.patch("/jobs/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const data = updateJobSchema.parse(req.body);
    const schedule = data.schedule;

    const job = await prisma.job.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        status: data.status,
        method: data.method,
        url: data.url,
        headers: data.headers,
        body: data.body,
        timeoutMs: data.timeoutMs,
        maxAttempts: data.maxAttempts,
        backoffType: data.backoffType,
        retryInitialDelayMs: data.retryInitialDelayMs,
        retryMaxDelayMs: data.retryMaxDelayMs,
        runAt: data.runAt,
        schedule: schedule
          ? {
              upsert: {
                create: {
                  cronExpression: schedule.cronExpression,
                  timezone: schedule.timezone,
                  nextRunAt: schedule.nextRunAt,
                },
                update: {
                  cronExpression: schedule.cronExpression,
                  timezone: schedule.timezone,
                  nextRunAt: schedule.nextRunAt,
                },
              },
            }
          : undefined,
      },
      include: { schedule: true },
    });

    res.json(job);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.delete("/jobs/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const job = await prisma.job.update({
      where: { id },
      data: { status: "DELETED" },
    });

    res.json(job);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (!sendValidationError(res, error)) next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`job-service listening on port ${port}`);
});

async function shutdown(signal: string) {
  console.log(`job-service received ${signal}, shutting down`);
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
