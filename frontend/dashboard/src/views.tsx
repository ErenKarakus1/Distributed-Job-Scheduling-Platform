import { AuditPanel, DataPanel, FilterBar, OverviewPanel, Pager, UserPanel, WorkerPanel } from "./components.js";
import { AuditFilterBar, JobCreateForm } from "./forms.js";
import type { DashboardView } from "./shell.js";
import type { AuditEvent, AuditFilters, AuthUser, ExecutionRow, JobRow, MetricsOverview, NewJobFormState, PageState, ServiceHealthMap, WorkerRow } from "./types.js";

type DashboardViewsProps = {
  activeView: DashboardView;
  auditEvents: AuditEvent[];
  auditFilters: AuditFilters;
  executionPage: PageState;
  executionStatusFilter: string;
  executions: ExecutionRow[];
  health: ServiceHealthMap;
  jobPage: PageState;
  jobStatusFilter: string;
  jobs: JobRow[];
  metrics: MetricsOverview;
  newJob: NewJobFormState;
  users: AuthUser[];
  workerPage: PageState;
  workers: WorkerRow[];
  onAuditFiltersChange: (filters: AuditFilters) => void;
  onCreateJob: (event: React.FormEvent<HTMLFormElement>) => void;
  onExecutionAction: (executionId: string, action: "cancel") => void;
  onExecutionPageChange: (page: PageState) => void;
  onExecutionStatusFilterChange: (status: string) => void;
  onJobAction: (jobId: string, action: "run" | "pause" | "resume") => void;
  onJobChange: (job: NewJobFormState) => void;
  onJobPageChange: (page: PageState) => void;
  onJobStatusFilterChange: (status: string) => void;
  onRefreshAuditEvents: () => void;
  onRefreshExecutions: (page?: PageState) => void;
  onRefreshJobs: (page?: PageState) => void;
  onRefreshWorkers: (page?: PageState) => void;
  onUserRoleChange: (userId: string, role: "ADMIN" | "VIEWER") => void;
  onWorkerPageChange: (page: PageState) => void;
};

export function DashboardViews(props: DashboardViewsProps) {
  if (props.activeView === "overview") {
    return <OverviewPanel metrics={props.metrics} />;
  }

  if (props.activeView === "jobs") {
    return (
      <>
        <JobCreateForm job={props.newJob} onChange={props.onJobChange} onSubmit={props.onCreateJob} />
        <FilterBar
          label="Job status"
          value={props.jobStatusFilter}
          options={["ACTIVE", "PAUSED", "DELETED"]}
          onChange={props.onJobStatusFilterChange}
          onApply={() => {
            const nextPage = { ...props.jobPage, offset: 0 };
            props.onJobPageChange(nextPage);
            props.onRefreshJobs(nextPage);
          }}
        />
        <DataPanel title="Jobs" rows={props.jobs} emptyText="No jobs loaded" onJobAction={props.onJobAction} />
        <Pager page={props.jobPage} onChange={props.onJobPageChange} onApply={props.onRefreshJobs} />
      </>
    );
  }

  if (props.activeView === "executions") {
    return (
      <>
        <FilterBar
          label="Execution status"
          value={props.executionStatusFilter}
          options={["PENDING", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "RETRY_SCHEDULED", "STALLED", "CANCELED"]}
          onChange={props.onExecutionStatusFilterChange}
          onApply={() => {
            const nextPage = { ...props.executionPage, offset: 0 };
            props.onExecutionPageChange(nextPage);
            props.onRefreshExecutions(nextPage);
          }}
        />
        <DataPanel title="Executions" rows={props.executions} emptyText="No executions loaded" expandableAttempts onExecutionAction={props.onExecutionAction} />
        <Pager page={props.executionPage} onChange={props.onExecutionPageChange} onApply={props.onRefreshExecutions} />
      </>
    );
  }

  if (props.activeView === "workers") {
    return (
      <>
        <WorkerPanel rows={props.workers} />
        <Pager page={props.workerPage} onChange={props.onWorkerPageChange} onApply={props.onRefreshWorkers} />
      </>
    );
  }

  if (props.activeView === "users") {
    return <UserPanel rows={props.users} onRoleChange={props.onUserRoleChange} />;
  }

  if (props.activeView === "audit") {
    return (
      <>
        <AuditFilterBar filters={props.auditFilters} onChange={props.onAuditFiltersChange} onApply={props.onRefreshAuditEvents} />
        <AuditPanel rows={props.auditEvents} />
      </>
    );
  }

  return (
    <section className="panel">
      <h2>Service Health</h2>
      <pre>{JSON.stringify(props.health, null, 2)}</pre>
    </section>
  );
}
