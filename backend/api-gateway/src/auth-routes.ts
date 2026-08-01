import express from "express";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { hashApiKey, hashPassword, verifyPassword } from "./auth.js";
import {
  createApiKeySchema,
  loginSchema,
  parseRouteId,
  registerSchema,
  updateUserRoleSchema,
} from "./validation.js";

type SignUserToken = (user: { id: string; email: string; role: string }) => string;

type AuthRouteDependencies = {
  prisma: PrismaClient;
  requireJwt: express.RequestHandler;
  signUserToken: SignUserToken;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function hideDevelopmentRoute(res: express.Response) {
  if (!isProduction()) {
    return false;
  }

  res.status(404).json({ error: "Not found" });
  return true;
}

function sendZodError(res: express.Response, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: error.issues });
    return true;
  }

  return false;
}

function hasPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function registerAuthRoutes(app: express.Express, deps: AuthRouteDependencies) {
  const { prisma, requireJwt, signUserToken } = deps;

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
      if (!sendZodError(res, error)) next(error);
    }
  });

  app.post("/auth/register", async (req, res, next) => {
    try {
      if (hideDevelopmentRoute(res)) return;

      const data = registerSchema.parse(req.body);
      const user = await prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: await hashPassword(data.password),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      res.status(201).json({ user, token: signUserToken(user) });
    } catch (error) {
      if (sendZodError(res, error)) return;

      if (hasPrismaCode(error, "P2002")) {
        res.status(409).json({ error: "User already exists" });
        return;
      }

      next(error);
    }
  });

  app.post("/auth/login", async (req, res, next) => {
    try {
      const data = loginSchema.parse(req.body);
      const userWithPassword = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (!userWithPassword || !(await verifyPassword(data.password, userWithPassword.passwordHash))) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const user = {
        id: userWithPassword.id,
        email: userWithPassword.email,
        name: userWithPassword.name,
        role: userWithPassword.role,
        createdAt: userWithPassword.createdAt,
      };

      res.json({ user, token: signUserToken(user) });
    } catch (error) {
      if (!sendZodError(res, error)) next(error);
    }
  });

  app.get("/auth/me", requireJwt, (_req, res) => {
    res.json({ user: res.locals.user });
  });

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
