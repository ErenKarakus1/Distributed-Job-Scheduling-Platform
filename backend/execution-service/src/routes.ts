import express from "express";
import { registerExecutionCommandRoutes } from "./command-routes.js";
import { registerExecutionReadRoutes } from "./read-routes.js";
import type { ExecutionRouteDependencies } from "./route-types.js";

export function registerExecutionRoutes(app: express.Express, deps: ExecutionRouteDependencies) {
  registerExecutionReadRoutes(app, { prisma: deps.prisma });
  registerExecutionCommandRoutes(app, deps);
}
