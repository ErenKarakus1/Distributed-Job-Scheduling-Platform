import express from "express";

const app = express();
const port = Number(process.env.JOB_SERVICE_PORT ?? 3001);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "job-service", status: "ok" });
});

app.listen(port, () => {
  console.log(`job-service listening on port ${port}`);
});

