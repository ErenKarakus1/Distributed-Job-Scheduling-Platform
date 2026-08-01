import express from "express";
import axios, { AxiosError } from "axios";
import type { GatewayServices } from "./types.js";

type HealthRouteDependencies = {
  services: GatewayServices;
};

export function registerHealthRoutes(app: express.Express, deps: HealthRouteDependencies) {
  const { services } = deps;

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
}
