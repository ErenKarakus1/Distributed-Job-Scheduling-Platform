import express from "express";
import axios, { AxiosError, Method } from "axios";

const app = express();
const port = Number(process.env.API_GATEWAY_PORT ?? 3000);
const jobServiceUrl = process.env.JOB_SERVICE_URL ?? "http://localhost:3001";
const executionServiceUrl = process.env.EXECUTION_SERVICE_URL ?? "http://localhost:3002";
const schedulerServiceUrl = process.env.SCHEDULER_SERVICE_URL ?? "http://localhost:3003";
const workerServiceUrl = process.env.WORKER_SERVICE_URL ?? "http://localhost:3004";

app.use(express.json());

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

app.all("/api/jobs", (req, res) => {
  void forwardRequest(req, res, services.job, "/jobs");
});

app.all("/api/jobs/:id", (req, res) => {
  void forwardRequest(req, res, services.job, `/jobs/${req.params.id}`);
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

app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});
