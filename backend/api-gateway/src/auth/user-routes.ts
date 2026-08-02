import express from "express";
import type { PrismaClient } from "@prisma/client";
import { routeParam } from "./auth.js";
import { hasPrismaCode, sendZodError } from "./auth-route-utils.js";
import { parseRouteId, updateUserRoleSchema } from "../validation.js";

type UserRouteDependencies = {
  prisma: PrismaClient;
  requireAdminUser: express.RequestHandler;
};

export function isSelfRoleChange(currentUserId: string | undefined, targetUserId: string) {
  return currentUserId === targetUserId;
}

export function registerUserRoutes(app: express.Express, deps: UserRouteDependencies) {
  const { prisma, requireAdminUser } = deps;

  app.get("/internal/users", requireAdminUser, async (_req, res, next) => {
    try {
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

  app.patch("/internal/users/:id/role", requireAdminUser, async (req, res, next) => {
    try {
      const id = parseRouteId(routeParam(req.params.id) ?? "");
      const data = updateUserRoleSchema.parse(req.body);

      if (isSelfRoleChange(res.locals.user?.id, id)) {
        res.status(409).json({ error: "You cannot change your own role" });
        return;
      }

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
