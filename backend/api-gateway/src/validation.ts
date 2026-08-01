import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
});

export const registerSchema = z.object({
  email: z.string().email().max(320).transform((email) => email.toLowerCase()),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const userRoleSchema = z.enum(["ADMIN", "VIEWER"]);

export const updateUserRoleSchema = z.object({
  role: userRoleSchema,
});

export function parseRouteId(id: string) {
  return z.string().uuid().parse(id);
}
