import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { sendValidationError } from "./http.js";
import { createJobSchema, jobStatusSchema, paginationSchema, parseId, updateJobSchema } from "./validation.js";

type JobRouteDependencies = {
  prisma: PrismaClient;
};

export function registerJobRoutes(app: express.Express, deps: JobRouteDependencies) {
  const { prisma } = deps;

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
}
