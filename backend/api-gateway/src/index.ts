import express from "express";
import cors from "cors";
import axios, { AxiosError, Method } from "axios";
import jwt, { type SignOptions } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const app = express();
const port = Number(process.env.API_GATEWAY_PORT ?? 3000);
const prisma = new PrismaClient();
const jobServiceUrl = process.env.JOB_SERVICE_URL ?? "http://localhost:3001";
const executionServiceUrl = process.env.EXECUTION_SERVICE_URL ?? "http://localhost:3002";
const schedulerServiceUrl = process.env.SCHEDULER_SERVICE_URL ?? "http://localhost:3003";
const workerServiceUrl = process.env.WORKER_SERVICE_URL ?? "http://localhost:3004";
const jwtSecret = process.env.JWT_SECRET ?? "development-jwt-secret-change-me";
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "8h") as SignOptions["expiresIn"];
const scrypt = promisify(scryptCallback);
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function requestLogger(service: string): express.RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      console.log(
        JSON.stringify({
          level: "info",
          event: "http_request",
          service,
          requestId: res.locals.requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  };
}

function requestIdMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requestId = req.header("x-request-id")?.trim() || randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

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

const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
});
const registerSchema = z.object({
  email: z.string().email().max(320).transform((email) => email.toLowerCase()),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});
const loginSchema = z.object({
  email: z.string().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(200),
});

type ServiceTarget = {
  name: string;
  baseUrl: string;
};

const services = {
  job: { name: "job-service", baseUrl: jobServiceUrl },
  execution: { name: "execution-service", baseUrl: executionServiceUrl },
  scheduler: { name: "scheduler-service", baseUrl: schedulerServiceUrl },
  worker: { name: "worker-service", baseUrl: workerServiceUrl },
} satisfies Record<string, ServiceTarget>;

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, expectedHash] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signUserToken(user: { id: string; email: string; role: string }) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

function readApiKey(req: express.Request) {
  const headerValue = req.header("x-api-key");

  if (!headerValue) {
    return undefined;
  }

  return headerValue.trim();
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
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;

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

async function forwardRequest(req: express.Request, res: express.Response, target: ServiceTarget, path: string) {
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

app.post("/internal/api-keys", async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Not found" });
      return;
    }

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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", issues: error.issues });
      return;
    }

    next(error);
  }
});

app.get("/internal/api-keys", async (_req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Not found" });
      return;
    }

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
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const id = z.string().uuid().parse(req.params.id);
    await prisma.apiKey.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", issues: error.issues });
      return;
    }

    next(error);
  }
});

app.post("/auth/register", async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Not found" });
      return;
    }

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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", issues: error.issues });
      return;
    }

    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", issues: error.issues });
      return;
    }

    next(error);
  }
});

app.get("/auth/me", requireJwt, (_req, res) => {
  res.json({ user: res.locals.user });
});

app.use("/api", requireApiAuth);

app.all("/api/jobs", (req, res) => {
  void forwardRequest(req, res, services.job, "/jobs");
});

app.all("/api/jobs/:id", (req, res) => {
  void forwardRequest(req, res, services.job, `/jobs/${req.params.id}`);
});

app.all("/api/jobs/:id/:action", (req, res) => {
  void forwardRequest(req, res, services.job, `/jobs/${req.params.id}/${req.params.action}`);
});

app.all("/api/executions", (req, res) => {
  void forwardRequest(req, res, services.execution, "/executions");
});

app.all("/api/executions/:id", (req, res) => {
  void forwardRequest(req, res, services.execution, `/executions/${req.params.id}`);
});

app.all("/api/executions/:id/:action", (req, res) => {
  void forwardRequest(req, res, services.execution, `/executions/${req.params.id}/${req.params.action}`);
});

app.get("/api/workers", (req, res) => {
  void forwardRequest(req, res, services.execution, "/workers");
});

app.get("/api/metrics/overview", (req, res) => {
  void forwardRequest(req, res, services.execution, "/metrics/overview");
});

app.post("/api/schedule/run", (req, res) => {
  void forwardRequest(req, res, services.scheduler, "/schedule/run");
});

app.post("/api/recover/stalled", (req, res) => {
  void forwardRequest(req, res, services.execution, "/recover/stalled");
});

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
