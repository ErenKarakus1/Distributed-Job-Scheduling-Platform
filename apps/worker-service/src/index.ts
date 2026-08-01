import express from "express";

const app = express();
const port = Number(process.env.WORKER_SERVICE_PORT ?? 3004);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "worker-service", status: "ok" });
});

app.listen(port, () => {
  console.log(`worker-service listening on port ${port}`);
});

