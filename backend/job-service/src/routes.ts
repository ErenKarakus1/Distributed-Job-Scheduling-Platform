import express from "express";
import { registerJobCommandRoutes } from "./command-routes.js";
import { registerJobReadRoutes } from "./read-routes.js";
import type { JobRouteDependencies } from "./route-types.js";

export function registerJobRoutes(app: express.Express, deps: JobRouteDependencies) {
  registerJobReadRoutes(app, deps);
  registerJobCommandRoutes(app, deps);
}
