import express from "express";
import type { PrismaClient } from "@prisma/client";
import { hasPrismaCode, hideDevelopmentRoute, sendZodError } from "./auth-route-utils.js";
import { parseRouteId, updateUserRoleSchema } from "./validation.js";

type UserRouteDependencies = {
  prisma: PrismaClient;
};

export function registerUserRoutes(app: express.Express, deps: UserRouteDependencies) {
  const { prisma } = deps;

  app.get("/internal/users", async (_req, res, next) => {
    try {
      if (hideDevelopmentRoute(res)) return;

      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ data: users });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/internal/users/:id/role", async (req, res, next) => {
    try {
      if (hideDevelopmentRoute(res)) return;

      const id = parseRouteId(req.params.id);
      const data = updateUserRoleSchema.parse(req.body);
      const user = await prisma.user.update({
        where: { id },
        data: { role: data.role },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.json(user);
    } catch (error) {
      if (sendZodError(res, error)) return;

      if (hasPrismaCode(error, "P2025")) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      next(error);
    }
  });
}
