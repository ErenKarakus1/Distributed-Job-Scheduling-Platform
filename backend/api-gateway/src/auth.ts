import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const scrypt = promisify(scryptCallback);

type HeaderReader = {
  header(name: string): string | undefined;
};

type RateLimitRequest = HeaderReader & {
  ip?: string;
};

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  actorType: z.string().min(1).max(80).optional(),
  actorId: z.string().min(1).max(200).optional(),
  action: z.string().min(1).max(120).optional(),
  resourceType: z.string().min(1).max(120).optional(),
  resourceId: z.string().min(1).max(200).optional(),
});

export function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, expectedHash] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function readApiKey(req: HeaderReader) {
  const headerValue = req.header("x-api-key");

  if (!headerValue) {
    return undefined;
  }

  return headerValue.trim();
}

export function readBearerToken(req: HeaderReader) {
  const authorization = req.header("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;
}

export function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function getRateLimitIdentity(req: RateLimitRequest) {
  const apiKey = readApiKey(req);
  const bearerToken = readBearerToken(req);

  if (apiKey) {
    return `api-key:${hashApiKey(apiKey)}`;
  }

  if (bearerToken) {
    return `jwt:${hashApiKey(bearerToken)}`;
  }

  return `ip:${req.ip ?? "unknown"}`;
}
