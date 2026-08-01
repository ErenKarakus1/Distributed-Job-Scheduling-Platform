import { Redis } from "ioredis";

export function createRedisClient(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379") {
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
}
