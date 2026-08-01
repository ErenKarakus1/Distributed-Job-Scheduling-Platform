export type SchedulerStats = {
  oneTimeQueued: number;
  recurringQueued: number;
  retriesQueued: number;
  pendingQueued: number;
};

export function countQueuedExecutions(stats: SchedulerStats) {
  return stats.oneTimeQueued + stats.recurringQueued + stats.retriesQueued + stats.pendingQueued;
}
