import type { MetricsOverview } from "../types.js";

export function OverviewPanel(props: { canMutate: boolean; metrics: MetricsOverview; onRecoverStalled: () => void; onRunScheduler: () => void }) {
  const jobs = props.metrics.jobs ?? {};
  const executions = props.metrics.executions ?? {};
  const workers = props.metrics.workers ?? {};
  const deadLetters = props.metrics.deadLetters ?? {};

  const cards: Array<[string, unknown]> = [
    ["Active jobs", jobs.active],
    ["Paused jobs", jobs.paused],
    ["Queued", executions.queued],
    ["Running", executions.running],
    ["Retrying", executions.retryScheduled],
    ["Failed", executions.failed],
    ["Succeeded", executions.succeeded],
    ["Active workers", workers.active],
    ["Dead letters", deadLetters.active],
  ];

  return (
    <>
      {props.canMutate && (
        <section className="operation-bar">
          <button onClick={props.onRunScheduler}>Run Scheduler</button>
          <button onClick={props.onRecoverStalled}>Recover Stalled</button>
        </section>
      )}
      <section className="metric-grid" aria-label="Platform overview">
        {cards.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{String(value ?? "-")}</strong>
          </article>
        ))}
      </section>
    </>
  );
}
