import express from "express";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashApiKey } from "./auth.js";
import { hasPrismaCode, hideDevelopmentRoute, sendZodError } from "./auth-route-utils.js";
import { createApiKeySchema, parseRouteId } from "./validation.js";

type ApiKeyRouteDependencies = {
  prisma: PrismaClient;
};

export function registerApiKeyRoutes(app: express.Express, deps: ApiKeyRouteDependencies) {
  const { prisma } = deps;

  app.post("/internal/api-keys", async (req, res, next) => {
    try {
      if (hideDevelopmentRoute(res)) return;

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

  app.get("/internal/api-keys", async (_req, res, next) => {
    try {
      if (hideDevelopmentRoute(res)) return;

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

  app.delete("/internal/api-keys/:id", async (req, res, next) => {
    try {
      if (hideDevelopmentRoute(res)) return;

      const id = parseRouteId(req.params.id);
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
