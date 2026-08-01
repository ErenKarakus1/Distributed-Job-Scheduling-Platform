import express from "express";
import { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { auditQuerySchema } from "./auth.js";

type AuditRouteDependencies = {
  prisma: PrismaClient;
};

export function registerAuditRoutes(app: express.Express, deps: AuditRouteDependencies) {
  const { prisma } = deps;

  app.get("/api/audit-events", async (req, res, next) => {
    try {
      const query = auditQuerySchema.parse(req.query);
      const where = {
        actorType: query.actorType,
        actorId: query.actorId,
        action: query.action,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
      };

      const events = await prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
      });

      res.json({ data: events });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: error.issues });
        return;
      }

      next(error);
    }
  });
}
