import { z } from "zod";

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(env: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse(env);
}
