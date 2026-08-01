import express from "express";
import cors from "cors";
import axios, { AxiosError, Method } from "axios";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const app = express();
const port = Number(process.env.API_GATEWAY_PORT ?? 3000);
const prisma = new PrismaClient();
const jobServiceUrl = process.env.JOB_SERVICE_URL ?? "http://localhost:3001";
const executionServiceUrl = process.env.EXECUTION_SERVICE_URL ?? "http://localhost:3002";
const schedulerServiceUrl = process.env.SCHEDULER_SERVICE_URL ?? "http://localhost:3003";
const workerServiceUrl = process.env.WORKER_SERVICE_URL ?? "http://localhost:3004";
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
    allowedHeaders: ["content-type", "x-api-key"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json());

const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
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

async function forwardRequest(req: express.Request, res: express.Response, target: ServiceTarget, path: string) {
  try {
    const response = await axios.request({
      method: req.method as Method,
      baseURL: target.baseUrl,
      url: path,
      params: req.query,
      data: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
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

app.use("/api", requireApiKey);

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

app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});
