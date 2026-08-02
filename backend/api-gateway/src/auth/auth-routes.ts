import express from "express";
import type { PrismaClient } from "@prisma/client";
import { registerApiKeyRoutes } from "./api-key-routes.js";
import { registerSessionRoutes } from "./session-routes.js";
import { registerUserRoutes } from "./user-routes.js";

type SignUserToken = (user: { id: string; email: string; role: string }) => string;

type AuthRouteDependencies = {
  prisma: PrismaClient;
  requireAdminUser: express.RequestHandler;
  requireJwt: express.RequestHandler;
  signUserToken: SignUserToken;
};

export function registerAuthRoutes(app: express.Express, deps: AuthRouteDependencies) {
  registerApiKeyRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerUserRoutes(app, deps);
}
