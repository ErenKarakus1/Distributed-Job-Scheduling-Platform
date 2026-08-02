export type SchedulerStats = {
  lockAcquired: boolean;
  oneTimeQueued: number;
  skipped: boolean;
  recurringQueued: number;
  retriesQueued: number;
  pendingQueued: number;
};

export function countQueuedExecutions(stats: SchedulerStats) {
  return (
    stats.oneTimeQueued +
    stats.recurringQueued +
    stats.retriesQueued +
    stats.pendingQueued
  );
}
