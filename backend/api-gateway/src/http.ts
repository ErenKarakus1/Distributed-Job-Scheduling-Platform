import express from "express";
import { randomUUID } from "node:crypto";

export function requestLogger(service: string): express.RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      console.log(
        JSON.stringify({
          level: "info",
          event: "http_request",
          service,
          requestId: res.locals.requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  };
}

export function requestIdMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requestId = req.header("x-request-id")?.trim() || randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
