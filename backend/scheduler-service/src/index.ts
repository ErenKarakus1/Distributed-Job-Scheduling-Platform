import express from "express";
import amqp from "amqplib";
import { PrismaClient } from "@prisma/client";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { registerSchedulerRoutes } from "./routes.js";
import { createScheduler } from "./scheduler.js";
import { countQueuedExecutions } from "./stats.js";

const app = express();
const port = Number(process.env.SCHEDULER_SERVICE_PORT ?? 3003);
const prisma = new PrismaClient();
const rabbitmqUrl = process.env.RABBITMQ_URL ?? "amqp://scheduler:scheduler@localhost:5672";
const readyQueueName = process.env.EXECUTION_READY_QUEUE ?? "execution.ready";
const deadLetterExchangeName = process.env.EXECUTION_DEAD_LETTER_EXCHANGE ?? "execution.dead";
const deadLetterQueueName = process.env.EXECUTION_DEAD_LETTER_QUEUE ?? "execution.dead";
const pollIntervalMs = Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 5000);
const batchSize = Number(process.env.SCHEDULER_BATCH_SIZE ?? 50);

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
    const stats = await runSchedulerOnce();

    if (stats.skipped) {
      return;
    }

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

registerSchedulerRoutes(app, { runSchedulerOnce });

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
