import express from "express";

const app = express();
const port = Number(process.env.SCHEDULER_SERVICE_PORT ?? 3003);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "scheduler-service", status: "ok" });
});

app.listen(port, () => {
  console.log(`scheduler-service listening on port ${port}`);
});

