import express from "express";
import { PrismaClient } from "@prisma/client";
import { requestIdMiddleware, requestLogger } from "./http.js";
import { registerJobRoutes } from "./routes.js";

const app = express();
const port = Number(process.env.JOB_SERVICE_PORT ?? 3001);
const prisma = new PrismaClient();

app.use(requestIdMiddleware);
app.use(requestLogger("job-service"));
app.use(express.json());

registerJobRoutes(app, { prisma });

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`job-service listening on port ${port}`);
});

async function shutdown(signal: string) {
  console.log(`job-service received ${signal}, shutting down`);
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
