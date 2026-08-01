import express from "express";
import amqp from "amqplib";
import axios, { AxiosError } from "axios";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { calculateBackoffDelayMs, getAttemptStatus, getAxiosErrorMessage } from "./execution.js";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { MalformedExecutionMessageError, normalizeHeaders, parseExecutionMessageContent, previewResponseBody } from "./message.js";

const app = express();
const port = Number(process.env.WORKER_SERVICE_PORT ?? 3004);
const prisma = new PrismaClient();
const rabbitmqUrl = process.env.RABBITMQ_URL ?? "amqp://scheduler:scheduler@localhost:5672";
const readyQueueName = process.env.EXECUTION_READY_QUEUE ?? "execution.ready";
const deadLetterExchangeName = process.env.EXECUTION_DEAD_LETTER_EXCHANGE ?? "execution.dead";
const deadLetterQueueName = process.env.EXECUTION_DEAD_LETTER_QUEUE ?? "execution.dead";
const serviceInstanceId = process.env.WORKER_INSTANCE_ID ?? `worker-${randomUUID()}`;
const heartbeatIntervalMs = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 10000);
const responsePreviewLimit = Number(process.env.WORKER_RESPONSE_PREVIEW_LIMIT ?? 4000);
const parsedWorkerConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 1);
const workerConcurrency = Number.isFinite(parsedWorkerConcurrency) ? Math.max(1, Math.min(parsedWorkerConcurrency, 50)) : 1;

let workerId: string | undefined;
let heartbeatInterval: NodeJS.Timeout | undefined;
let rabbitConnection: amqp.ChannelModel | undefined;
let rabbitChannel: amqp.Channel | undefined;
let consumerTag: string | undefined;
const activeExecutions = new Set<string>();

app.use(requestIdMiddleware);
app.use(requestLogger("worker-service"));
app.use(express.json());

function parseExecutionMessage(message: amqp.Message) {
  return parseExecutionMessageContent(message.content.toString());
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

async function startConsumer() {
  await registerWorker();

  const connection = await amqp.connect(rabbitmqUrl);
  const channel = await connection.createChannel();
  rabbitConnection = connection;
  rabbitChannel = channel;
  await channel.assertExchange(deadLetterExchangeName, "direct", { durable: true });
  await channel.assertQueue(deadLetterQueueName, { durable: true });
  await channel.bindQueue(deadLetterQueueName, deadLetterExchangeName, deadLetterQueueName);
  await channel.assertQueue(readyQueueName, {
    durable: true,
    deadLetterExchange: deadLetterExchangeName,
    deadLetterRoutingKey: deadLetterQueueName,
  });
  await channel.prefetch(workerConcurrency);

  const consumer = await channel.consume(readyQueueName, async (message) => {
    if (!message) {
      return;
    }

    try {
      const payload = parseExecutionMessage(message);
      await executeJob(payload.executionId);
      channel.ack(message);
    } catch (error) {
      console.error("worker failed to process execution message", error);
      const shouldRequeue = !(error instanceof MalformedExecutionMessageError);
      channel.nack(message, false, shouldRequeue);
    }
  });
  consumerTag = consumer.consumerTag;

  heartbeatInterval = setInterval(() => {
    heartbeatWorker().catch((error: unknown) => {
      console.error("worker heartbeat failed", error);
    });
  }, heartbeatIntervalMs);

  console.log(`worker ${serviceInstanceId} consuming ${readyQueueName} with concurrency ${workerConcurrency}`);
}

app.get("/health", (_req, res) => {
  res.json({
    service: "worker-service",
    status: "ok",
    workerId,
    serviceInstanceId,
    workerConcurrency,
    activeExecutionCount: activeExecutions.size,
  });
});

const server = app.listen(port, () => {
  console.log(`worker-service listening on port ${port}`);
});

startConsumer().catch((error: unknown) => {
  console.error("worker failed to start consumer", error);
});

async function shutdown(signal: string) {
  console.log(`worker-service received ${signal}, shutting down`);
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  server.close(async () => {
    if (consumerTag) {
      await rabbitChannel?.cancel(consumerTag);
    }
    await rabbitChannel?.close();
    await rabbitConnection?.close();
    if (workerId) {
      await prisma.worker.update({
        where: { id: workerId },
        data: { status: "OFFLINE", currentExecutionId: null, activeExecutionCount: 0, lastHeartbeatAt: new Date() },
      });
    }
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
