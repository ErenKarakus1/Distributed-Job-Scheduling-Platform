import express from "express";
import amqp from "amqplib";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { registerSchedulerRoutes } from "./routes.js";
import { createScheduler } from "./scheduler.js";
import { countQueuedExecutions } from "./stats.js";

const app = express();
const port = Number(process.env.SCHEDULER_SERVICE_PORT ?? 3003);
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});
const rabbitmqUrl = process.env.RABBITMQ_URL ?? "amqp://scheduler:scheduler@localhost:5672";
const readyQueueName = process.env.EXECUTION_READY_QUEUE ?? "execution.ready";
const deadLetterExchangeName = process.env.EXECUTION_DEAD_LETTER_EXCHANGE ?? "execution.dead";
const deadLetterQueueName = process.env.EXECUTION_DEAD_LETTER_QUEUE ?? "execution.dead";
const pollIntervalMs = Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 5000);
const batchSize = Number(process.env.SCHEDULER_BATCH_SIZE ?? 50);
const schedulerLockKey = process.env.SCHEDULER_LOCK_KEY ?? "scheduler:run-lock";
const schedulerLockTtlMs = Number(process.env.SCHEDULER_LOCK_TTL_MS ?? 30000);

app.use(requestIdMiddleware);
app.use(requestLogger("scheduler-service"));
app.use(express.json());

let channelPromise: Promise<amqp.Channel> | undefined;
let rabbitConnection: amqp.ChannelModel | undefined;
let schedulerInterval: NodeJS.Timeout | undefined;
let schedulerRunning = false;

function getChannel() {
  channelPromise ??= amqp.connect(rabbitmqUrl).then(async (connection) => {
    rabbitConnection = connection;
    const channel = await connection.createChannel();
    await channel.assertExchange(deadLetterExchangeName, "direct", { durable: true });
    await channel.assertQueue(deadLetterQueueName, { durable: true });
    await channel.bindQueue(deadLetterQueueName, deadLetterExchangeName, deadLetterQueueName);
    await channel.assertQueue(readyQueueName, {
      durable: true,
      deadLetterExchange: deadLetterExchangeName,
      deadLetterRoutingKey: deadLetterQueueName,
    });

    connection.on("close", () => {
      channelPromise = undefined;
    });

    connection.on("error", () => {
      channelPromise = undefined;
    });

    return channel;
  });

  return channelPromise;
}

async function acquireSchedulerLock() {
  if (redis.status === "wait") {
    await redis.connect();
  }

  const token = randomUUID();
  const acquired = await redis.set(schedulerLockKey, token, "PX", schedulerLockTtlMs, "NX");

  return acquired === "OK" ? token : undefined;
}

async function releaseSchedulerLock(token: string) {
  const currentToken = await redis.get(schedulerLockKey);

  if (currentToken === token) {
    await redis.del(schedulerLockKey);
  }
}

async function runSchedulerOnceWithLock(now = new Date()) {
  const lockToken = await acquireSchedulerLock();

  if (!lockToken) {
    return { acquired: false as const, stats: undefined };
  }

  try {
    const stats = await runSchedulerOnce(now);
    return { acquired: true as const, stats };
  } finally {
    await releaseSchedulerLock(lockToken);
  }
}

async function publishExecution(executionId: string) {
  const channel = await getChannel();
  const payload = Buffer.from(JSON.stringify({ executionId }));

  channel.sendToQueue(readyQueueName, payload, {
    contentType: "application/json",
    deliveryMode: 2,
  });
}

const { runSchedulerOnce } = createScheduler({ prisma, batchSize, publishExecution });

async function runSchedulerLoop() {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const result = await runSchedulerOnceWithLock();

    if (!result.acquired) {
      return;
    }

    const stats = result.stats;
    const queued = countQueuedExecutions(stats);

    if (queued > 0) {
      console.log(`scheduler queued ${queued} execution(s)`, stats);
    }
  } catch (error) {
    console.error("scheduler loop failed", error);
  } finally {
    schedulerRunning = false;
  }
}

registerSchedulerRoutes(app, { runSchedulerOnceWithLock });

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`scheduler-service listening on port ${port}`);
});

schedulerInterval = setInterval(runSchedulerLoop, pollIntervalMs);

async function shutdown(signal: string) {
  console.log(`scheduler-service received ${signal}, shutting down`);
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  server.close(async () => {
    await rabbitConnection?.close();
    redis.disconnect();
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
