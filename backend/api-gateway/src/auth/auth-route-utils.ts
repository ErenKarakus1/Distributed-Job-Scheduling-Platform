import type express from "express";
import { ZodError } from "zod";

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function hideDevelopmentRoute(res: express.Response) {
  if (!isProduction()) {
    return false;
  }

  res.status(404).json({ error: "Not found" });
  return true;
}

export function sendZodError(res: express.Response, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: error.issues });
    return true;
  }

  return false;
}

export function hasPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
