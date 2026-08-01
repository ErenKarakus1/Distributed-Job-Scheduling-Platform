import axios, { AxiosError } from "axios";
import { PrismaClient } from "@prisma/client";
import { calculateBackoffDelayMs, getAttemptStatus, getAxiosErrorMessage } from "./execution.js";
import { normalizeHeaders, previewResponseBody } from "./message.js";

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

export function createWorkerRuntime(deps: WorkerRuntimeDependencies) {
  const { prisma, serviceInstanceId, responsePreviewLimit } = deps;
  const activeExecutions = new Set<string>();
  let workerId: string | undefined;

  async function registerWorker() {
    const worker = await prisma.worker.upsert({
      where: { serviceInstanceId },
      create: {
        serviceInstanceId,
        status: "IDLE",
        lastHeartbeatAt: new Date(),
      },
      update: {
        status: "IDLE",
        lastHeartbeatAt: new Date(),
        currentExecutionId: null,
        activeExecutionCount: 0,
      },
    });

    workerId = worker.id;
    return worker;
  }

  async function heartbeatWorker() {
    if (!workerId) {
      return;
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: {
        lastHeartbeatAt: new Date(),
        activeExecutionCount: activeExecutions.size,
        status: activeExecutions.size > 0 ? "BUSY" : "IDLE",
      },
    });
  }

  async function markWorkerBusy(executionId: string) {
    if (!workerId) {
      throw new Error("Worker is not registered");
    }

    activeExecutions.add(executionId);

    await prisma.worker.update({
      where: { id: workerId },
      data: {
        status: "BUSY",
        currentExecutionId: executionId,
        activeExecutionCount: activeExecutions.size,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async function completeWorkerExecution(executionId: string) {
    if (!workerId) {
      return;
    }

    activeExecutions.delete(executionId);
    const nextExecutionId = activeExecutions.values().next().value as string | undefined;

    await prisma.worker.update({
      where: { id: workerId },
      data: {
        status: activeExecutions.size > 0 ? "BUSY" : "IDLE",
        currentExecutionId: nextExecutionId ?? null,
        activeExecutionCount: activeExecutions.size,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async function recordAttempt(input: RecordAttemptInput) {
    if (!workerId) {
      throw new Error("Worker is not registered");
    }

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

      const attemptNumber = execution.attemptCount + 1;
      const retryable = input.status !== "SUCCEEDED" && attemptNumber < execution.job.maxAttempts;
      const nextAttemptAt = retryable ? new Date(input.finishedAt.getTime() + calculateBackoffDelayMs(execution.job, attemptNumber + 1)) : null;

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

      await tx.execution.updateMany({
        where: {
          id: input.executionId,
          status: "RUNNING",
          lockedByWorkerId: workerId,
        },
        data: {
          attemptCount: attemptNumber,
          status: input.status === "SUCCEEDED" ? "SUCCEEDED" : retryable ? "RETRY_SCHEDULED" : "FAILED",
          nextAttemptAt,
          lockedByWorkerId: null,
          finishedAt: input.status === "SUCCEEDED" || !retryable ? input.finishedAt : null,
        },
      });
    });
  }

  async function executeJob(executionId: string) {
    if (!workerId) {
      throw new Error("Worker is not registered");
    }

    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      include: { job: true },
    });

    if (!execution) {
      console.warn(`execution ${executionId} was not found`);
      return;
    }

    if (execution.status === "CANCELED" || execution.status === "SUCCEEDED" || execution.status === "FAILED") {
      console.warn(`execution ${executionId} is already terminal with status ${execution.status}`);
      return;
    }

    const startedAt = new Date();
    await markWorkerBusy(executionId);

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
      await completeWorkerExecution(executionId);
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
        responseBodyPreview: previewResponseBody(response.data, responsePreviewLimit),
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
        responseBodyPreview: previewResponseBody(axiosError.response?.data, responsePreviewLimit),
        errorMessage: getAxiosErrorMessage(error),
        startedAt,
        finishedAt,
      });
    } finally {
      await completeWorkerExecution(executionId);
    }
  }

  async function markWorkerOffline() {
    if (!workerId) {
      return;
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: { status: "OFFLINE", currentExecutionId: null, activeExecutionCount: 0, lastHeartbeatAt: new Date() },
    });
  }

  function getWorkerState() {
    return {
      workerId,
      activeExecutionCount: activeExecutions.size,
    };
  }

  return {
    executeJob,
    getWorkerState,
    heartbeatWorker,
    markWorkerOffline,
    registerWorker,
  };
}
