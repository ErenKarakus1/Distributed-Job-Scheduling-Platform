import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { sendValidationError } from "./http.js";
import { calculateBackoffDelayMs } from "./retry.js";
import type { RecoverStalledExecutions } from "./route-types.js";
import {
  heartbeatSchema,
  markQueuedSchema,
  markRunningSchema,
  parseId,
  recordAttemptSchema,
  recoverStalledSchema,
  retryExecutionSchema,
} from "./validation.js";

type CommandRouteDependencies = {
  prisma: PrismaClient;
  recoverStalledExecutions: RecoverStalledExecutions;
};

class ExecutionNotFoundError extends Error {
  constructor() {
    super("Execution not found");
    this.name = "ExecutionNotFoundError";
  }
}

class ExecutionJobDeletedError extends Error {
  constructor() {
    super("Execution cannot be retried because its job is deleted");
    this.name = "ExecutionJobDeletedError";
  }
}

export function registerExecutionCommandRoutes(
  app: express.Express,
  deps: CommandRouteDependencies,
) {
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res
          .status(404)
          .json({ error: "Running execution not found for worker" });
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
          throw new ExecutionNotFoundError();
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
        const retryable =
          !succeeded && attemptNumber < execution.job.maxAttempts;
        const nextAttemptAt = retryable
          ? new Date(
              finishedAt.getTime() +
                calculateBackoffDelayMs(execution.job, attemptNumber + 1),
            )
          : null;
        const deadLetterReason =
          !succeeded && !retryable ? "MAX_ATTEMPTS_EXHAUSTED" : undefined;

        const updatedExecution = await tx.execution.update({
          where: { id },
          data: {
            attemptCount: attemptNumber,
            status: succeeded
              ? "SUCCEEDED"
              : retryable
                ? "RETRY_SCHEDULED"
                : "FAILED",
            nextAttemptAt,
            lockedByWorkerId: null,
            finishedAt: succeeded || !retryable ? finishedAt : null,
          },
          include: { job: true, attempts: true },
        });

        if (deadLetterReason) {
          await tx.deadLetterMessage.create({
            data: {
              executionId: execution.id,
              reason: deadLetterReason,
              sourceQueue: "execution.ready",
              error: data.errorMessage,
              payload: {
                executionId: execution.id,
                jobId: execution.jobId,
                attemptNumber,
                status: data.status,
                httpStatusCode: data.httpStatusCode,
              },
            },
          });
        }

        return { execution: updatedExecution, attempt };
      });

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof ExecutionNotFoundError) {
        res.status(404).json({ error: error.message });
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
        include: { job: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      if (["SUCCEEDED", "FAILED", "CANCELED"].includes(existing.status)) {
        res
          .status(409)
          .json({ error: `Execution is already ${existing.status}` });
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.post("/executions/:id/retry", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const data = retryExecutionSchema.parse(req.body);
      const retryAt = data.retryAt ?? new Date();

      const existing = await prisma.execution.findUnique({
        where: { id },
        include: { job: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      if (!["FAILED", "CANCELED"].includes(existing.status)) {
        res.status(409).json({
          error: `Execution cannot be retried from ${existing.status}`,
        });
        return;
      }

      if (existing.job.status === "DELETED") {
        res.status(409).json({
          error: "Execution cannot be retried because its job is deleted",
        });
        return;
      }

      const execution = await prisma.execution.update({
        where: { id, status: existing.status },
        data: {
          status: "PENDING",
          nextAttemptAt: retryAt,
          lockedByWorkerId: null,
          lastHeartbeatAt: null,
          startedAt: null,
          finishedAt: null,
        },
        include: { job: true, attempts: true },
      });

      res.json(execution);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.post("/dead-letter/:id/requeue", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);

      const result = await prisma.$transaction(async (tx) => {
        const message = await tx.deadLetterMessage.findUnique({
          where: { id },
        });

        if (!message) {
          throw new ExecutionNotFoundError();
        }

        if (message.discardedAt) {
          throw new Error("Dead-letter message was already discarded");
        }

        if (message.requeuedAt) {
          throw new Error("Dead-letter message was already requeued");
        }

        if (message.executionId) {
          const execution = await tx.execution.findUnique({
            where: { id: message.executionId },
            include: { job: true },
          });

          if (!execution) {
            throw new ExecutionNotFoundError();
          }

          if (execution.job.status === "DELETED") {
            throw new ExecutionJobDeletedError();
          }

          await tx.execution.update({
            where: { id: message.executionId },
            data: {
              status: "PENDING",
              nextAttemptAt: new Date(),
              lockedByWorkerId: null,
              lastHeartbeatAt: null,
              startedAt: null,
              finishedAt: null,
            },
          });
        }

        return tx.deadLetterMessage.update({
          where: { id },
          data: { requeuedAt: new Date() },
        });
      });

      res.json(result);
    } catch (error) {
      if (error instanceof ExecutionNotFoundError) {
        res.status(404).json({ error: "Dead-letter message not found" });
        return;
      }

      if (
        error instanceof Error &&
        error.message.startsWith("Dead-letter message was already")
      ) {
        res.status(409).json({ error: error.message });
        return;
      }

      if (error instanceof ExecutionJobDeletedError) {
        res.status(409).json({ error: error.message });
        return;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "Related execution not found" });
        return;
      }

      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.delete("/dead-letter/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);

      const message = await prisma.deadLetterMessage.findUnique({
        where: { id },
      });

      if (!message) {
        res.status(404).json({ error: "Dead-letter message not found" });
        return;
      }

      if (message.requeuedAt) {
        res
          .status(409)
          .json({ error: "Dead-letter message was already requeued" });
        return;
      }

      const discarded = await prisma.deadLetterMessage.update({
        where: { id },
        data: { discardedAt: new Date() },
      });

      res.json(discarded);
    } catch (error) {
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
