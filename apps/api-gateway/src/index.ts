import express from "express";

const app = express();
const port = Number(process.env.API_GATEWAY_PORT ?? 3000);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "api-gateway", status: "ok" });
});

app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});

