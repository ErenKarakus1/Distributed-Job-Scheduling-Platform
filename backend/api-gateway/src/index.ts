import express from "express";
import cors from "cors";
import axios, { AxiosError, Method } from "axios";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import {
  auditQuerySchema,
  getRateLimitIdentity,
  hashApiKey,
  readApiKey,
  readBearerToken,
} from "./auth.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { registerProxyRoutes } from "./proxy-routes.js";
import type { AuditInput, GatewayServices, ServiceTarget } from "./types.js";

const app = express();
const port = Number(process.env.API_GATEWAY_PORT ?? 3000);
const prisma = new PrismaClient();
const jobServiceUrl = process.env.JOB_SERVICE_URL ?? "http://localhost:3001";
const executionServiceUrl = process.env.EXECUTION_SERVICE_URL ?? "http://localhost:3002";
const schedulerServiceUrl = process.env.SCHEDULER_SERVICE_URL ?? "http://localhost:3003";
const workerServiceUrl = process.env.WORKER_SERVICE_URL ?? "http://localhost:3004";
const jwtSecret = process.env.JWT_SECRET ?? "development-jwt-secret-change-me";
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "8h") as SignOptions["expiresIn"];
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});
const rateLimitWindowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60000);
const rateLimitMaxRequests = Number(process.env.API_RATE_LIMIT_MAX_REQUESTS ?? 120);
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
    allowedHeaders: ["authorization", "content-type", "x-api-key", "x-request-id"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(requestIdMiddleware);
app.use(requestLogger("api-gateway"));
app.use(express.json());

const services = {
  job: { name: "job-service", baseUrl: jobServiceUrl },
  execution: { name: "execution-service", baseUrl: executionServiceUrl },
  scheduler: { name: "scheduler-service", baseUrl: schedulerServiceUrl },
  worker: { name: "worker-service", baseUrl: workerServiceUrl },
} satisfies GatewayServices;

function signUserToken(user: { id: string; email: string; role: string }) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

function getAuditActor(req: express.Request, res: express.Response) {
  const apiKey = readApiKey(req);

  if (apiKey) {
    return {
      actorType: "API_KEY",
      actorId: hashApiKey(apiKey),
      actorLabel: "api-key",
    };
  }

  const user = res.locals.user as { id?: string; email?: string } | undefined;

  return {
    actorType: "USER",
    actorId: user?.id,
    actorLabel: user?.email,
  };
}

async function recordAuditEvent(req: express.Request, res: express.Response, audit: AuditInput) {
  const actor = getAuditActor(req, res);

  await prisma.auditEvent.create({
    data: {
      ...actor,
      action: audit.action,
      resourceType: audit.resourceType,
      resourceId: audit.resourceId,
      requestId: String(res.locals.requestId),
      metadata: audit.metadata ?? undefined,
    },
  });
}

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
  if (readApiKey(req)) {
    next();
    return;
  }

  if (res.locals.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Admin role is required" });
    return;
  }

  next();
}

async function forwardRequest(req: express.Request, res: express.Response, target: ServiceTarget, path: string, audit?: AuditInput) {
  try {
    const response = await axios.request({
      method: req.method as Method,
      baseURL: target.baseUrl,
      url: path,
      params: req.query,
      data: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      headers: { "x-request-id": String(res.locals.requestId) },
      validateStatus: () => true,
    });

    if (audit && response.status >= 200 && response.status < 300) {
      await recordAuditEvent(req, res, audit);
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    const axiosError = error as AxiosError;
    const message = axiosError.message || `${target.name} request failed`;

    res.status(502).json({
      error: "Bad gateway",
      service: target.name,
      message,
    });
  }
}

app.get("/health", (_req, res) => {
  res.json({ service: "api-gateway", status: "ok" });
});

app.get("/health/services", async (_req, res) => {
  const entries = await Promise.all(
    Object.values(services).map(async (service) => {
      try {
        const response = await axios.get("/health", {
          baseURL: service.baseUrl,
          headers: { "x-request-id": String(res.locals.requestId) },
          timeout: 2000,
          validateStatus: () => true,
        });

        return [service.name, { statusCode: response.status, body: response.data }];
      } catch (error) {
        const axiosError = error as AxiosError;
        return [service.name, { statusCode: 502, error: axiosError.message }];
      }
    }),
  );

  res.json(Object.fromEntries(entries));
});

registerAuthRoutes(app, { prisma, requireJwt, signUserToken });

app.use("/api", rateLimitRequests, requireApiAuth);

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

registerProxyRoutes(app, { services, requireAdminUser, forwardRequest });

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});

async function shutdown(signal: string) {
  console.log(`api-gateway received ${signal}, shutting down`);
  server.close(async () => {
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
