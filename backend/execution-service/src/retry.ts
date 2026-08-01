export function calculateBackoffDelayMs(
  job: {
    backoffType: "FIXED" | "EXPONENTIAL";
    retryInitialDelayMs: number;
    retryMaxDelayMs: number;
  },
  nextAttemptNumber: number,
) {
  const baseDelay = job.retryInitialDelayMs;
  const delay =
    job.backoffType === "EXPONENTIAL"
      ? baseDelay * 2 ** Math.max(nextAttemptNumber - 2, 0)
      : baseDelay;

  return Math.min(delay, job.retryMaxDelayMs);
}
