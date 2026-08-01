import type { PrismaClient } from "@prisma/client";

export type JobRouteDependencies = {
  prisma: PrismaClient;
};
