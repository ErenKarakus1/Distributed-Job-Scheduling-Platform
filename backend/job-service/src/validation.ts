import { Prisma } from "@prisma/client";
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

export const httpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
export const jobTypeSchema = z.enum(["ONE_TIME", "RECURRING"]);
export const jobStatusSchema = z.enum(["ACTIVE", "PAUSED", "DELETED"]);
export const mutableJobStatusSchema = z.enum(["ACTIVE", "PAUSED"]);
export const backoffTypeSchema = z.enum(["FIXED", "EXPONENTIAL"]);
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const jsonValueSchema = z
  .unknown()
  .transform((value) => value as Prisma.InputJsonValue);

export function isValidCronExpression(
  cronExpression: string,
  timezone: string,
) {
  try {
    CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    return true;
  } catch {
    return false;
  }
}

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const jobPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  type: jobTypeSchema,
  method: httpMethodSchema,
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: jsonValueSchema.optional(),
  timeoutMs: z.number().int().min(100).max(300000).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  backoffType: backoffTypeSchema.optional(),
  retryInitialDelayMs: z.number().int().min(0).max(3600000).optional(),
  retryMaxDelayMs: z.number().int().min(0).max(86400000).optional(),
  runAt: z.coerce.date().optional(),
  schedule: z
    .object({
      cronExpression: z.string().min(1).max(120),
      timezone: z.string().min(1).max(80).default("UTC"),
      nextRunAt: z.coerce.date(),
    })
    .optional(),
});

export const createJobSchema = jobPayloadSchema.superRefine((job, ctx) => {
  if (job.type === "ONE_TIME" && !job.runAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "runAt is required for ONE_TIME jobs",
      path: ["runAt"],
    });
  }

  if (job.type === "RECURRING" && !job.schedule) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "schedule is required for RECURRING jobs",
      path: ["schedule"],
    });
  }

  if (job.schedule) {
    if (!isValidTimezone(job.schedule.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "timezone must be a valid IANA timezone, such as UTC or Europe/Istanbul",
        path: ["schedule", "timezone"],
      });
    } else if (
      !isValidCronExpression(job.schedule.cronExpression, job.schedule.timezone)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cronExpression must be a valid cron expression",
        path: ["schedule", "cronExpression"],
      });
    }
  }
});

export const updateJobSchema = jobPayloadSchema
  .partial()
  .extend({
    status: mutableJobStatusSchema.optional(),
  })
  .superRefine((job, ctx) => {
    if (
      job.retryInitialDelayMs &&
      job.retryMaxDelayMs &&
      job.retryInitialDelayMs > job.retryMaxDelayMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "retryInitialDelayMs must be less than or equal to retryMaxDelayMs",
        path: ["retryInitialDelayMs"],
      });
    }

    if (job.schedule) {
      if (!isValidTimezone(job.schedule.timezone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "timezone must be a valid IANA timezone, such as UTC or Europe/Istanbul",
          path: ["schedule", "timezone"],
        });
      } else if (
        !isValidCronExpression(
          job.schedule.cronExpression,
          job.schedule.timezone,
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cronExpression must be a valid cron expression",
          path: ["schedule", "cronExpression"],
        });
      }
    }
  });

export function parseId(id: string) {
  return z.string().uuid().parse(id);
}
