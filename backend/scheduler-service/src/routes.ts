import express from "express";
import { Prisma } from "@prisma/client";
import { sendValidationError } from "./http.js";
import type { SchedulerStats } from "./stats.js";
import { scheduleRunSchema } from "./validation.js";

type RunSchedulerOnceWithLock = (
  now?: Date,
) => Promise<
  | { acquired: true; stats: SchedulerStats }
  | { acquired: false; stats: undefined }
>;

type SchedulerRouteDependencies = {
  runSchedulerOnceWithLock: RunSchedulerOnceWithLock;
};

export function registerSchedulerRoutes(app: express.Express, deps: SchedulerRouteDependencies) {
  const { runSchedulerOnceWithLock } = deps;

  app.get("/health", (_req, res) => {
    res.json({ service: "scheduler-service", status: "ok" });
  });

  app.post("/schedule/run", async (req, res, next) => {
    try {
      const data = scheduleRunSchema.parse(req.body);
      const result = await runSchedulerOnceWithLock(data.now ?? new Date());

      if (!result.acquired) {
        res.status(409).json({ error: "Scheduler lock is already held" });
        return;
      }

      res.json(result.stats);
    } catch (error) {
      if (sendValidationError(res, error)) return;

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(409).json({ error: "Scheduling conflict", code: error.code });
        return;
      }

      next(error);
    }
  });
}
