import { Prisma } from "@prisma/client";

export type ServiceTarget = {
  name: string;
  baseUrl: string;
};

export type GatewayServices = {
  job: ServiceTarget;
  execution: ServiceTarget;
  scheduler: ServiceTarget;
  worker: ServiceTarget;
};

export type AuditInput = {
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonObject;
};
