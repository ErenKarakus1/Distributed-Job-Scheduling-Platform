import express from "express";
import cors from "cors";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { registerAuditRoutes } from "./audit-routes.js";
import { registerAuthRoutes } from "./auth/auth-routes.js";
import { createForwarding } from "./forwarding.js";
import { registerHealthRoutes } from "./health-routes.js";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { createGatewayMiddleware } from "./middleware.js";
import { registerProxyRoutes } from "./proxy-routes.js";
import type { GatewayServices } from "./types.js";

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

const { rateLimitRequests, requireAdminUser, requireApiAuth, requireJwt } = createGatewayMiddleware({
  prisma,
  redis,
  jwtSecret,
  rateLimitMaxRequests,
  rateLimitWindowMs,
});
const { forwardRequest } = createForwarding({ prisma });

function signUserToken(user: { id: string; email: string; role: string }) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

registerHealthRoutes(app, { services });
app.use("/internal", requireJwt);
registerAuthRoutes(app, { prisma, requireAdminUser, requireJwt, signUserToken });

app.use("/api", rateLimitRequests, requireApiAuth);
registerAuditRoutes(app, { prisma });
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
