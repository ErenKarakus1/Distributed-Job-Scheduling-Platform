import express from "express";
import amqp from "amqplib";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { MalformedExecutionMessageError, parseExecutionMessageContent } from "./message.js";
import { registerWorkerRoutes } from "./routes.js";
import { createWorkerRuntime } from "./worker.js";

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

let heartbeatInterval: NodeJS.Timeout | undefined;
let rabbitConnection: amqp.ChannelModel | undefined;
let rabbitChannel: amqp.Channel | undefined;
let consumerTag: string | undefined;
const workerRuntime = createWorkerRuntime({ prisma, serviceInstanceId, responsePreviewLimit });

app.use(requestIdMiddleware);
app.use(requestLogger("worker-service"));
app.use(express.json());

function parseExecutionMessage(message: amqp.Message) {
  return parseExecutionMessageContent(message.content.toString());
}

async function recordMalformedDeadLetter(message: amqp.Message, error: unknown) {
  const rawPayload = message.content.toString();

  await prisma.deadLetterMessage.create({
    data: {
      reason: "MALFORMED_MESSAGE",
      sourceQueue: readyQueueName,
      error: error instanceof Error ? error.message : "Malformed execution message",
      payload: {
        rawPayload,
      },
    },
  });
}

async function startConsumer() {
  await workerRuntime.registerWorker();

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
      await workerRuntime.executeJob(payload.executionId);
      channel.ack(message);
    } catch (error) {
      console.error("worker failed to process execution message", error);
      const shouldRequeue = !(error instanceof MalformedExecutionMessageError);
      if (!shouldRequeue) {
        await recordMalformedDeadLetter(message, error);
      }
      channel.nack(message, false, shouldRequeue);
    }
  });
  consumerTag = consumer.consumerTag;

  heartbeatInterval = setInterval(() => {
    workerRuntime.heartbeatWorker().catch((error: unknown) => {
      console.error("worker heartbeat failed", error);
    });
  }, heartbeatIntervalMs);

  console.log(`worker ${serviceInstanceId} consuming ${readyQueueName} with concurrency ${workerConcurrency}`);
}

registerWorkerRoutes(app, {
  serviceInstanceId,
  workerConcurrency,
  getWorkerState: workerRuntime.getWorkerState,
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
    await workerRuntime.markWorkerOffline();
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
