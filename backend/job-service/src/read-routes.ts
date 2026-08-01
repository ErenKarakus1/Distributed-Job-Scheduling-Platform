import express from "express";
import { sendValidationError } from "./http.js";
import type { JobRouteDependencies } from "./route-types.js";
import { createJobSchema, jobStatusSchema, paginationSchema, parseId } from "./validation.js";

export function registerJobReadRoutes(app: express.Express, deps: JobRouteDependencies) {
  const { prisma } = deps;

  app.get("/health", (_req, res) => {
    res.json({ service: "job-service", status: "ok" });
  });

  app.post("/jobs", async (req, res, next) => {
    try {
      const data = createJobSchema.parse(req.body);

      const job = await prisma.job.create({
        data: {
          name: data.name,
          type: data.type,
          method: data.method,
          url: data.url,
          headers: data.headers,
          body: data.body,
          timeoutMs: data.timeoutMs,
          maxAttempts: data.maxAttempts,
          backoffType: data.backoffType,
          retryInitialDelayMs: data.retryInitialDelayMs,
          retryMaxDelayMs: data.retryMaxDelayMs,
          runAt: data.runAt,
          schedule: data.schedule
            ? {
                create: {
                  cronExpression: data.schedule.cronExpression,
                  timezone: data.schedule.timezone,
                  nextRunAt: data.schedule.nextRunAt,
                },
              }
            : undefined,
        },
        include: { schedule: true },
      });

      res.status(201).json(job);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/jobs", async (req, res, next) => {
    try {
      const status = req.query.status ? jobStatusSchema.parse(req.query.status) : undefined;
      const pagination = paginationSchema.parse(req.query);

      const where = { status };
      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          include: { schedule: true },
          orderBy: { createdAt: "desc" },
          take: pagination.limit,
          skip: pagination.offset,
        }),
        prisma.job.count({ where }),
      ]);

      res.json({ data: jobs, page: { ...pagination, total } });
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/jobs/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const job = await prisma.job.findUnique({
        where: { id },
        include: { schedule: true },
      });

      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      res.json(job);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });
}
