import { z } from "zod";

export type ExecutionMessage = {
  executionId: string;
};

const executionMessageSchema = z.object({
  executionId: z.string().uuid(),
});

export class MalformedExecutionMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedExecutionMessageError";
  }
}

export function previewResponseBody(data: unknown, responsePreviewLimit: number) {
  if (data === undefined || data === null) {
    return undefined;
  }

  const text = typeof data === "string" ? data : JSON.stringify(data);
  return text.slice(0, responsePreviewLimit);
}

export function normalizeHeaders(headers: unknown) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    }),
  );
}

export function parseExecutionMessageContent(rawPayload: string) {
  let payload: unknown;

  try {
    payload = JSON.parse(rawPayload);
  } catch {
    throw new MalformedExecutionMessageError("Execution message must be valid JSON");
  }

  try {
    return executionMessageSchema.parse(payload) satisfies ExecutionMessage;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MalformedExecutionMessageError("Execution message payload is invalid");
    }

    throw error;
  }
}
