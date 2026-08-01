import type { PrismaClient } from "@prisma/client";

export type RecoverStalledExecutions = (now?: Date) => Promise<unknown>;

export type ExecutionRouteDependencies = {
  prisma: PrismaClient;
  recoverStalledExecutions: RecoverStalledExecutions;
};
