import express from "express";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashApiKey, routeParam } from "./auth.js";
import { hasPrismaCode, sendZodError } from "./auth-route-utils.js";
import { createApiKeySchema, parseRouteId } from "../validation.js";

type ApiKeyRouteDependencies = {
  prisma: PrismaClient;
  requireAdminUser: express.RequestHandler;
};

export function registerApiKeyRoutes(app: express.Express, deps: ApiKeyRouteDependencies) {
  const { prisma, requireAdminUser } = deps;

  app.post("/internal/api-keys", requireAdminUser, async (req, res, next) => {
    try {
      const data = createApiKeySchema.parse(req.body);
      const apiKey = `djsp_${randomBytes(32).toString("hex")}`;
      const key = await prisma.apiKey.create({
        data: {
          name: data.name,
          keyHash: hashApiKey(apiKey),
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
      });

      res.status(201).json({ ...key, apiKey });
    } catch (error) {
      if (!sendZodError(res, error)) next(error);
    }
  });

  app.get("/internal/api-keys", requireAdminUser, async (_req, res, next) => {
    try {
      const keys = await prisma.apiKey.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ data: keys });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/internal/api-keys/:id", requireAdminUser, async (req, res, next) => {
    try {
      const id = parseRouteId(routeParam(req.params.id) ?? "");
      await prisma.apiKey.delete({
        where: { id },
      });

      res.status(204).send();
    } catch (error) {
      if (sendZodError(res, error)) return;

      if (hasPrismaCode(error, "P2025")) {
        res.status(404).json({ error: "API key not found" });
        return;
      }

      next(error);
    }
  });
}
