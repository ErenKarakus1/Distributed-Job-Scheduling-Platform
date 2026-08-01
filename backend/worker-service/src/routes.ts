import express from "express";

type WorkerState = {
  workerId: string | undefined;
  activeExecutionCount: number;
};

type WorkerRouteDependencies = {
  serviceInstanceId: string;
  workerConcurrency: number;
  getWorkerState: () => WorkerState;
};

export function registerWorkerRoutes(app: express.Express, deps: WorkerRouteDependencies) {
  const { serviceInstanceId, workerConcurrency, getWorkerState } = deps;

  app.get("/health", (_req, res) => {
    const state = getWorkerState();

    res.json({
      service: "worker-service",
      status: "ok",
      workerId: state.workerId,
      serviceInstanceId,
      workerConcurrency,
      activeExecutionCount: state.activeExecutionCount,
    });
  });
}
