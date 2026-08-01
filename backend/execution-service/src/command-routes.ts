import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { sendValidationError } from "./http.js";
import { calculateBackoffDelayMs } from "./retry.js";
import type { RecoverStalledExecutions } from "./route-types.js";
import { heartbeatSchema, markQueuedSchema, markRunningSchema, parseId, recordAttemptSchema, recoverStalledSchema } from "./validation.js";

type CommandRouteDependencies = {
  prisma: PrismaClient;
  recoverStalledExecutions: RecoverStalledExecutions;
};

export function registerExecutionCommandRoutes(app: express.Express, deps: CommandRouteDependencies) {
  const { prisma, recoverStalledExecutions } = deps;

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
}
