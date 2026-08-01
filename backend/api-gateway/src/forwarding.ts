import express from "express";
import axios, { AxiosError, Method } from "axios";
import type { PrismaClient } from "@prisma/client";
import { hashApiKey, readApiKey } from "./auth/auth.js";
import type { AuditInput, ServiceTarget } from "./types.js";

type ForwardingDependencies = {
  prisma: PrismaClient;
};

function getAuditActor(req: express.Request, res: express.Response) {
  const apiKey = readApiKey(req);

  if (apiKey) {
    return {
      actorType: "API_KEY",
      actorId: hashApiKey(apiKey),
      actorLabel: "api-key",
    };
  }

  const user = res.locals.user as { id?: string; email?: string } | undefined;

  return {
    actorType: "USER",
    actorId: user?.id,
    actorLabel: user?.email,
  };
}

export function createForwarding(deps: ForwardingDependencies) {
  const { prisma } = deps;

  async function recordAuditEvent(req: express.Request, res: express.Response, audit: AuditInput) {
    const actor = getAuditActor(req, res);

    await prisma.auditEvent.create({
      data: {
        ...actor,
        action: audit.action,
        resourceType: audit.resourceType,
        resourceId: audit.resourceId,
        requestId: String(res.locals.requestId),
        metadata: audit.metadata ?? undefined,
      },
    });
  }

  async function forwardRequest(req: express.Request, res: express.Response, target: ServiceTarget, path: string, audit?: AuditInput) {
    try {
      const response = await axios.request({
        method: req.method as Method,
        baseURL: target.baseUrl,
        url: path,
        params: req.query,
        data: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
        headers: { "x-request-id": String(res.locals.requestId) },
        validateStatus: () => true,
      });

      if (audit && response.status >= 200 && response.status < 300) {
        await recordAuditEvent(req, res, audit);
      }

      res.status(response.status).json(response.data);
    } catch (error) {
      const axiosError = error as AxiosError;
      const message = axiosError.message || `${target.name} request failed`;

      res.status(502).json({
        error: "Bad gateway",
        service: target.name,
        message,
      });
    }
  }

  return { forwardRequest };
}
