import axios, { AxiosError } from "axios";
import { PrismaClient } from "@prisma/client";
import {
  calculateBackoffDelayMs,
  getAttemptStatus,
  getAxiosErrorMessage,
} from "./execution.js";
import { normalizeHeaders, previewResponseBody } from "./message.js";
import { createWorkerState } from "./worker-state.js";

type WorkerRuntimeDependencies = {
  prisma: PrismaClient;
  serviceInstanceId: string;
  responsePreviewLimit: number;
};

type RecordAttemptInput = {
  executionId: string;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  httpStatusCode?: number;
  responseBodyPreview?: string;
  errorMessage?: string;
  startedAt: Date;
  finishedAt: Date;
};

export function shouldDeadLetterAttempt(
  status: RecordAttemptInput["status"],
  retryable: boolean,
) {
  return status !== "SUCCEEDED" && !retryable;
}

export function createWorkerRuntime(deps: WorkerRuntimeDependencies) {
  const { prisma, serviceInstanceId, responsePreviewLimit } = deps;
  const workerState = createWorkerState({ prisma, serviceInstanceId });

  async function recordAttempt(input: RecordAttemptInput) {
    const workerId = workerState.requireWorkerId();

    await prisma.$transaction(async (tx) => {
      const execution = await tx.execution.findUnique({
        where: { id: input.executionId },
        include: { job: true },
      });

      if (!execution) {
        throw new Error(`Execution ${input.executionId} not found`);
      }

      if (execution.status === "CANCELED") {
        return;
      }

      const latestAttempt = await tx.executionAttempt.aggregate({
        where: { executionId: input.executionId },
        _max: { attemptNumber: true },
      });
      const attemptNumber =
        Math.max(
          execution.attemptCount,
          latestAttempt._max.attemptNumber ?? 0,
        ) + 1;
      const retryable =
        input.status !== "SUCCEEDED" &&
        execution.job.status === "ACTIVE" &&
        attemptNumber < execution.job.maxAttempts;
      const nextAttemptAt = retryable
        ? new Date(
            input.finishedAt.getTime() +
              calculateBackoffDelayMs(execution.job, attemptNumber + 1),
          )
        : null;
      const deadLetterReason = shouldDeadLetterAttempt(input.status, retryable)
        ? "MAX_ATTEMPTS_EXHAUSTED"
        : undefined;

      await tx.executionAttempt.create({
        data: {
          executionId: input.executionId,
          attemptNumber,
          workerId,
          status: input.status,
          httpStatusCode: input.httpStatusCode,
          responseBodyPreview: input.responseBodyPreview,
          errorMessage: input.errorMessage,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
        },
      });

      const updatedExecution = await tx.execution.updateMany({
        where: {
          id: input.executionId,
          status: "RUNNING",
          lockedByWorkerId: workerId,
        },
        data: {
          attemptCount: attemptNumber,
          status:
            input.status === "SUCCEEDED"
              ? "SUCCEEDED"
              : retryable
                ? "RETRY_SCHEDULED"
                : "FAILED",
          nextAttemptAt,
          lockedByWorkerId: null,
          finishedAt:
            input.status === "SUCCEEDED" || !retryable
              ? input.finishedAt
              : null,
        },
      });

      if (updatedExecution.count === 0) {
        return;
      }

      if (deadLetterReason) {
        await tx.deadLetterMessage.create({
          data: {
            executionId: execution.id,
            reason: deadLetterReason,
            sourceQueue: "execution.ready",
            error: input.errorMessage,
            payload: {
              executionId: execution.id,
              jobId: execution.jobId,
              attemptNumber,
              status: input.status,
              httpStatusCode: input.httpStatusCode,
            },
          },
        });
      }
    });
  }

  async function executeJob(executionId: string) {
    const workerId = workerState.requireWorkerId();

    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      include: { job: true },
    });

    if (!execution) {
      console.warn(`execution ${executionId} was not found`);
      return;
    }

    if (
      execution.status === "CANCELED" ||
      execution.status === "SUCCEEDED" ||
      execution.status === "FAILED"
    ) {
      console.warn(
        `execution ${executionId} is already terminal with status ${execution.status}`,
      );
      return;
    }

    if (execution.job.status === "DELETED") {
      await prisma.execution.updateMany({
        where: {
          id: executionId,
          status: { in: ["PENDING", "QUEUED", "RETRY_SCHEDULED", "STALLED"] },
        },
        data: {
          status: "CANCELED",
          nextAttemptAt: null,
          lockedByWorkerId: null,
          finishedAt: new Date(),
        },
      });
      console.warn(
        `execution ${executionId} was canceled because its job is deleted`,
      );
      return;
    }

    const startedAt = new Date();
    await workerState.markWorkerBusy(executionId);

    const claimed = await prisma.execution.updateMany({
      where: {
        id: executionId,
        status: { in: ["PENDING", "QUEUED", "RETRY_SCHEDULED", "STALLED"] },
      },
      data: {
        status: "RUNNING",
        lockedByWorkerId: workerId,
        startedAt,
        lastHeartbeatAt: startedAt,
      },
    });

    if (claimed.count === 0) {
      console.warn(`execution ${executionId} could not be claimed`);
      await workerState.completeWorkerExecution(executionId);
      return;
    }

    try {
      const response = await axios.request({
        method: execution.job.method,
        url: execution.job.url,
        headers: normalizeHeaders(execution.job.headers),
        data: execution.job.body ?? undefined,
        timeout: execution.job.timeoutMs,
        validateStatus: () => true,
      });

      const finishedAt = new Date();
      const succeeded = response.status >= 200 && response.status < 300;

      await recordAttempt({
        executionId,
        status: succeeded ? "SUCCEEDED" : "FAILED",
        httpStatusCode: response.status,
        responseBodyPreview: previewResponseBody(
          response.data,
          responsePreviewLimit,
        ),
        startedAt,
        finishedAt,
      });
    } catch (error) {
      const finishedAt = new Date();
      const axiosError = error as AxiosError;

      await recordAttempt({
        executionId,
        status: getAttemptStatus(error),
        httpStatusCode: axiosError.response?.status,
        responseBodyPreview: previewResponseBody(
          axiosError.response?.data,
          responsePreviewLimit,
        ),
        errorMessage: getAxiosErrorMessage(error),
        startedAt,
        finishedAt,
      });
    } finally {
      await workerState.completeWorkerExecution(executionId);
    }
  }

  return {
    executeJob,
    getWorkerState: workerState.getWorkerState,
    heartbeatWorker: workerState.heartbeatWorker,
    markWorkerOffline: workerState.markWorkerOffline,
    registerWorker: workerState.registerWorker,
  };
}
