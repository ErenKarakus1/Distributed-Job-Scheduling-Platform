import express from "express";
import jwt from "jsonwebtoken";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { getRateLimitIdentity, hashApiKey, readApiKey, readBearerToken } from "./auth/auth.js";

type GatewayMiddlewareDependencies = {
  prisma: PrismaClient;
  redis: Redis;
  jwtSecret: string;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
};

export function canAccessAdminRoute(user: { role?: string } | undefined) {
  return user?.role === "ADMIN";
}

export function createGatewayMiddleware(deps: GatewayMiddlewareDependencies) {
  const { jwtSecret, prisma, rateLimitMaxRequests, rateLimitWindowMs, redis } = deps;

  async function rateLimitRequests(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (rateLimitMaxRequests <= 0 || rateLimitWindowMs <= 0) {
      next();
      return;
    }

    try {
      if (redis.status === "wait") {
        await redis.connect();
      }

      const windowSeconds = Math.ceil(rateLimitWindowMs / 1000);
      const key = `rate-limit:${getRateLimitIdentity(req)}:${Math.floor(Date.now() / rateLimitWindowMs)}`;
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const remaining = Math.max(rateLimitMaxRequests - count, 0);
      res.setHeader("x-ratelimit-limit", String(rateLimitMaxRequests));
      res.setHeader("x-ratelimit-remaining", String(remaining));
      res.setHeader("x-ratelimit-window-ms", String(rateLimitWindowMs));

      if (count > rateLimitMaxRequests) {
        res.status(429).json({ error: "Rate limit exceeded" });
        return;
      }

      next();
    } catch (error) {
      console.error("rate limit check failed", error);
      next();
    }
  }

  async function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
    const apiKey = readApiKey(req);

    if (!apiKey) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }

    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(apiKey) },
    });

    if (!key) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    next();
  }

  async function requireJwt(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = readBearerToken(req);

    if (!token) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    try {
      const payload = jwt.verify(token, jwtSecret);

      if (!payload || typeof payload !== "object" || typeof payload.sub !== "string") {
        res.status(401).json({ error: "Invalid bearer token" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });

      if (!user) {
        res.status(401).json({ error: "Invalid bearer token" });
        return;
      }

      res.locals.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid bearer token" });
    }
  }

  async function requireApiAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (readApiKey(req)) {
      await requireApiKey(req, res, next);
      return;
    }

    await requireJwt(req, res, next);
  }

  function requireAdminUser(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!canAccessAdminRoute(res.locals.user)) {
      res.status(403).json({ error: "Admin role is required" });
      return;
    }

    next();
  }

  return {
    rateLimitRequests,
    requireAdminUser,
    requireApiAuth,
    requireApiKey,
    requireJwt,
  };
}
