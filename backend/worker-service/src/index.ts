import express from "express";
import amqp from "amqplib";
import axios, { AxiosError } from "axios";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const app = express();
const port = Number(process.env.WORKER_SERVICE_PORT ?? 3004);
const prisma = new PrismaClient();
const rabbitmqUrl = process.env.RABBITMQ_URL ?? "amqp://scheduler:scheduler@localhost:5672";
const readyQueueName = process.env.EXECUTION_READY_QUEUE ?? "execution.ready";
const serviceInstanceId = process.env.WORKER_INSTANCE_ID ?? `worker-${randomUUID()}`;
const heartbeatIntervalMs = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 10000);
const responsePreviewLimit = Number(process.env.WORKER_RESPONSE_PREVIEW_LIMIT ?? 4000);

let workerId: string | undefined;

app.use(express.json());

type ExecutionMessage = {
  executionId: string;
};

function previewResponseBody(data: unknown) {
  if (data === undefined || data === null) {
    return undefined;
  }

  const text = typeof data === "string" ? data : JSON.stringify(data);
  return text.slice(0, responsePreviewLimit);
}

function normalizeHeaders(headers: unknown) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    }),
  );
}

function getAxiosErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown worker execution error";
}

function getAttemptStatus(error: unknown) {
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
    return "TIMED_OUT" as const;
  }

  return "FAILED" as const;
}

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
    data: { lastHeartbeatAt: new Date() },
  });
}

async function markWorkerBusy(executionId: string) {
  if (!workerId) {
    throw new Error("Worker is not registered");
  }

  await prisma.worker.update({
    where: { id: workerId },
    data: {
      status: "BUSY",
      currentExecutionId: executionId,
      lastHeartbeatAt: new Date(),
    },
  });
}

async function markWorkerIdle() {
  if (!workerId) {
    return;
  }

  await prisma.worker.update({
    where: { id: workerId },
    data: {
      status: "IDLE",
      currentExecutionId: null,
      lastHeartbeatAt: new Date(),
    },
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
    await markWorkerIdle();
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
      responseBodyPreview: previewResponseBody(response.data),
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
      responseBodyPreview: previewResponseBody(axiosError.response?.data),
      errorMessage: getAxiosErrorMessage(error),
      startedAt,
      finishedAt,
    });
  } finally {
    await markWorkerIdle();
  }
}

async function recordAttempt(input: {
  executionId: string;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  httpStatusCode?: number;
  responseBodyPreview?: string;
  errorMessage?: string;
  startedAt: Date;
  finishedAt: Date;
}) {
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

function calculateBackoffDelayMs(job: {
  backoffType: "FIXED" | "EXPONENTIAL";
  retryInitialDelayMs: number;
  retryMaxDelayMs: number;
}, nextAttemptNumber: number) {
  const delay =
    job.backoffType === "EXPONENTIAL"
      ? job.retryInitialDelayMs * 2 ** Math.max(nextAttemptNumber - 2, 0)
      : job.retryInitialDelayMs;

  return Math.min(delay, job.retryMaxDelayMs);
}

async function startConsumer() {
  await registerWorker();

  const connection = await amqp.connect(rabbitmqUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(readyQueueName, { durable: true });
  await channel.prefetch(1);

  await channel.consume(readyQueueName, async (message) => {
    if (!message) {
      return;
    }

    try {
      const payload = JSON.parse(message.content.toString()) as ExecutionMessage;
      await executeJob(payload.executionId);
      channel.ack(message);
    } catch (error) {
      console.error("worker failed to process execution message", error);
      channel.nack(message, false, true);
    }
  });

  setInterval(() => {
    heartbeatWorker().catch((error: unknown) => {
      console.error("worker heartbeat failed", error);
    });
  }, heartbeatIntervalMs);

  console.log(`worker ${serviceInstanceId} consuming ${readyQueueName}`);
}

app.get("/health", (_req, res) => {
  res.json({ service: "worker-service", status: "ok", workerId, serviceInstanceId });
});

app.listen(port, () => {
  console.log(`worker-service listening on port ${port}`);
});

startConsumer().catch((error: unknown) => {
  console.error("worker failed to start consumer", error);
});
