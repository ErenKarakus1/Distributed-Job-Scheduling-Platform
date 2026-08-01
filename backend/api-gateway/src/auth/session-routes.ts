import express from "express";
import type { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "./auth.js";
import { hasPrismaCode, hideDevelopmentRoute, sendZodError } from "./auth-route-utils.js";
import { loginSchema, registerSchema } from "../validation.js";

type SignUserToken = (user: { id: string; email: string; role: string }) => string;

type SessionRouteDependencies = {
  prisma: PrismaClient;
  requireJwt: express.RequestHandler;
  signUserToken: SignUserToken;
};

export function registerSessionRoutes(app: express.Express, deps: SessionRouteDependencies) {
  const { prisma, requireJwt, signUserToken } = deps;

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
}
