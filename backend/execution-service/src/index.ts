import express from "express";
import { PrismaClient } from "@prisma/client";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { calculateStaleBefore, isExecutionStale, planStalledExecutionRecovery } from "./recovery.js";
import { registerExecutionRoutes } from "./routes.js";

const app = express();
const port = Number(process.env.EXECUTION_SERVICE_PORT ?? 3002);
const prisma = new PrismaClient();
const stalledAfterMs = Number(process.env.EXECUTION_STALLED_AFTER_MS ?? 60000);
const recoveryIntervalMs = Number(process.env.EXECUTION_RECOVERY_INTERVAL_MS ?? 15000);
const recoveryBatchSize = Number(process.env.EXECUTION_RECOVERY_BATCH_SIZE ?? 50);
let recoveryRunning = false;
let recoveryInterval: NodeJS.Timeout | undefined;

app.use(requestIdMiddleware);
app.use(requestLogger("execution-service"));
app.use(express.json());

async function recoverStalledExecutions(now = new Date()) {
  const staleBefore = calculateStaleBefore(now, stalledAfterMs);
  const stalledExecutions = await prisma.execution.findMany({
    where: {
      status: "RUNNING",
      lastHeartbeatAt: { lt: staleBefore },
    },
    include: { job: true },
    orderBy: { lastHeartbeatAt: "asc" },
    take: recoveryBatchSize,
  });

  let retryScheduled = 0;
  let failed = 0;

  for (const execution of stalledExecutions) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.execution.findUnique({
        where: { id: execution.id },
        include: { job: true },
      });

      if (!current || current.status !== "RUNNING" || !isExecutionStale(current, staleBefore)) {
        return;
      }

      const recovery = planStalledExecutionRecovery(current, now, stalledAfterMs);

      await tx.executionAttempt.create({
        data: {
          executionId: current.id,
          attemptNumber: recovery.attemptNumber,
          workerId: current.lockedByWorkerId,
          status: "FAILED",
          errorMessage: recovery.errorMessage,
          startedAt: recovery.startedAt,
          finishedAt: now,
          durationMs: recovery.durationMs,
        },
      });

      await tx.execution.update({
        where: { id: current.id },
        data: {
          attemptCount: recovery.attemptNumber,
          status: recovery.status,
          nextAttemptAt: recovery.nextAttemptAt,
          lockedByWorkerId: null,
          finishedAt: recovery.finishedAt,
        },
      });

      if (recovery.retryable) {
        retryScheduled += 1;
      } else {
        failed += 1;
      }
    });
  }

  return {
    scanned: stalledExecutions.length,
    retryScheduled,
    failed,
    staleBefore,
  };
}

async function runRecoveryLoop() {
  if (recoveryRunning) {
    return;
  }

  recoveryRunning = true;

  try {
    const stats = await recoverStalledExecutions();

    if (stats.scanned > 0) {
      console.log("recovered stalled executions", stats);
    }
  } catch (error) {
    console.error("stalled execution recovery failed", error);
  } finally {
    recoveryRunning = false;
  }
}

registerExecutionRoutes(app, { prisma, recoverStalledExecutions });

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`execution-service listening on port ${port}`);
});

recoveryInterval = setInterval(runRecoveryLoop, recoveryIntervalMs);

async function shutdown(signal: string) {
  console.log(`execution-service received ${signal}, shutting down`);
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
  }

  server.close(async () => {
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
