import express from "express";

const app = express();
const port = Number(process.env.EXECUTION_SERVICE_PORT ?? 3002);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "execution-service", status: "ok" });
});

app.listen(port, () => {
  console.log(`execution-service listening on port ${port}`);
});

