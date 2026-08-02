import express from "express";
import { Prisma } from "@prisma/client";
import { sendValidationError } from "./http.js";
import type { JobRouteDependencies } from "./route-types.js";
import { parseId, updateJobSchema } from "./validation.js";

class JobNotFoundError extends Error {
  constructor() {
    super("Job not found");
    this.name = "JobNotFoundError";
  }
}

class JobPausedError extends Error {
  constructor() {
    super("Paused jobs cannot be run manually");
    this.name = "JobPausedError";
  }
}

class JobDeletedError extends Error {
  constructor() {
    super("Deleted jobs cannot be changed");
    this.name = "JobDeletedError";
  }
}

export function canChangeJobStatus(currentStatus: string | undefined) {
  return currentStatus !== "DELETED";
}

export function registerJobCommandRoutes(
  app: express.Express,
  deps: JobRouteDependencies,
) {
  const { prisma } = deps;

  app.post("/jobs/:id/run", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const scheduledFor = new Date();

      const execution = await prisma.$transaction(async (tx) => {
        const job = await tx.job.findUnique({
          where: { id },
        });

        if (!job || job.status === "DELETED") {
          throw new JobNotFoundError();
        }

        if (job.status === "PAUSED") {
          throw new JobPausedError();
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
      if (error instanceof JobNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }

      if (error instanceof JobPausedError) {
        res.status(409).json({ error: error.message });
        return;
      }

      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.post("/jobs/:id/pause", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);

      const existing = await prisma.job.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existing) {
        throw new JobNotFoundError();
      }

      if (!canChangeJobStatus(existing.status)) {
        throw new JobDeletedError();
      }

      const job = await prisma.job.update({
        where: { id },
        data: { status: "PAUSED" },
        include: { schedule: true },
      });

      res.json(job);
    } catch (error) {
      if (error instanceof JobNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }

      if (error instanceof JobDeletedError) {
        res.status(409).json({ error: error.message });
        return;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.post("/jobs/:id/resume", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);

      const existing = await prisma.job.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existing) {
        throw new JobNotFoundError();
      }

      if (!canChangeJobStatus(existing.status)) {
        throw new JobDeletedError();
      }

      const job = await prisma.job.update({
        where: { id },
        data: { status: "ACTIVE" },
        include: { schedule: true },
      });

      res.json(job);
    } catch (error) {
      if (error instanceof JobNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }

      if (error instanceof JobDeletedError) {
        res.status(409).json({ error: error.message });
        return;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
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

      const existing = await prisma.job.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existing) {
        throw new JobNotFoundError();
      }

      if (!canChangeJobStatus(existing.status)) {
        throw new JobDeletedError();
      }

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
      if (error instanceof JobNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }

      if (error instanceof JobDeletedError) {
        res.status(409).json({ error: error.message });
        return;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.delete("/jobs/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);

      const job = await prisma.$transaction(async (tx) => {
        const deletedJob = await tx.job.update({
          where: { id },
          data: { status: "DELETED" },
        });

        await tx.execution.updateMany({
          where: {
            jobId: id,
            status: { in: ["PENDING", "QUEUED", "RETRY_SCHEDULED", "STALLED"] },
          },
          data: {
            status: "CANCELED",
            nextAttemptAt: null,
            lockedByWorkerId: null,
            lastHeartbeatAt: null,
            finishedAt: new Date(),
          },
        });

        return deletedJob;
      });

      res.json(job);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      if (!sendValidationError(res, error)) next(error);
    }
  });
}
