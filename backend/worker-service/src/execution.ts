import axios from "axios";

export function getAxiosErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown worker execution error";
}

export function getAttemptStatus(error: unknown) {
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
    return "TIMED_OUT" as const;
  }

  return "FAILED" as const;
}

export function calculateBackoffDelayMs(
  job: {
    backoffType: "FIXED" | "EXPONENTIAL";
    retryInitialDelayMs: number;
    retryMaxDelayMs: number;
  },
  nextAttemptNumber: number,
) {
  const delay =
    job.backoffType === "EXPONENTIAL"
      ? job.retryInitialDelayMs * 2 ** Math.max(nextAttemptNumber - 2, 0)
      : job.retryInitialDelayMs;

  return Math.min(delay, job.retryMaxDelayMs);
}
