import express from "express";
import { Prisma } from "@prisma/client";
import { sendValidationError } from "./http.js";
import type { SchedulerStats } from "./stats.js";
import { scheduleRunSchema } from "./validation.js";

type RunSchedulerOnce = (now?: Date) => Promise<SchedulerStats>;

type SchedulerRouteDependencies = {
  runSchedulerOnce: RunSchedulerOnce;
};

export function registerSchedulerRoutes(app: express.Express, deps: SchedulerRouteDependencies) {
  const { runSchedulerOnce } = deps;

  app.get("/health", (_req, res) => {
    res.json({ service: "scheduler-service", status: "ok" });
  });

  app.post("/schedule/run", async (req, res, next) => {
    try {
      const data = scheduleRunSchema.parse(req.body);
      const stats = await runSchedulerOnce(data.now ?? new Date());

      if (stats.skipped) {
        res.status(409).json({ error: "Scheduler run skipped because another scheduler holds the lock" });
        return;
      }

      res.json(stats);
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
