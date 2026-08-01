import type { PrismaClient } from "@prisma/client";

type WorkerStateDependencies = {
  prisma: PrismaClient;
  serviceInstanceId: string;
};

export function createWorkerState(deps: WorkerStateDependencies) {
  const { prisma, serviceInstanceId } = deps;
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

  async function markWorkerOffline() {
    if (!workerId) {
      return;
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: { status: "OFFLINE", currentExecutionId: null, activeExecutionCount: 0, lastHeartbeatAt: new Date() },
    });
  }

  function requireWorkerId() {
    if (!workerId) {
      throw new Error("Worker is not registered");
    }

    return workerId;
  }

  function getWorkerState() {
    return {
      workerId,
      activeExecutionCount: activeExecutions.size,
    };
  }

  return {
    completeWorkerExecution,
    getWorkerState,
    heartbeatWorker,
    markWorkerBusy,
    markWorkerOffline,
    registerWorker,
    requireWorkerId,
  };
}
