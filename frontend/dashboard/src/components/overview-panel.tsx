export function OverviewPanel(props: { metrics: Record<string, unknown> }) {
  const jobs = (props.metrics.jobs ?? {}) as Record<string, unknown>;
  const executions = (props.metrics.executions ?? {}) as Record<string, unknown>;
  const workers = (props.metrics.workers ?? {}) as Record<string, unknown>;

  const cards: Array<[string, unknown]> = [
    ["Active jobs", jobs.active],
    ["Paused jobs", jobs.paused],
    ["Queued", executions.queued],
    ["Running", executions.running],
    ["Retrying", executions.retryScheduled],
    ["Failed", executions.failed],
    ["Succeeded", executions.succeeded],
    ["Active workers", workers.active],
  ];

  return (
    <section className="metric-grid" aria-label="Platform overview">
      {cards.map(([label, value]) => (
        <article className="metric-card" key={label}>
          <span>{label}</span>
          <strong>{String(value ?? "-")}</strong>
        </article>
      ))}
    </section>
  );
}
