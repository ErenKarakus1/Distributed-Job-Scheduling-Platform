import { ApiKeyPanel, AuditPanel, DataPanel, DeadLetterPanel, FilterBar, HealthPanel, OverviewPanel, Pager, UserPanel, WorkerPanel } from "../components/index.js";
import { ApiKeyCreateForm, AuditFilterBar, JobCreateForm } from "../forms.js";
import type { DashboardView } from "../layouts/dashboard-shell.js";
import type {
  ApiKeyRow,
  AuditEvent,
  AuditFilters,
  AuthUser,
  CreatedApiKey,
  DeadLetterRow,
  DeadLetterSummary,
  ExecutionRow,
  JobRow,
  MetricsOverview,
  NewJobFormState,
  PageState,
  ServiceHealthMap,
  WorkerRow,
} from "../types.js";

type DashboardViewsProps = {
  activeView: DashboardView;
  auditEvents: AuditEvent[];
  auditFilters: AuditFilters;
  apiKeyName: string;
  apiKeys: ApiKeyRow[];
  authUser: AuthUser;
  createdApiKey: CreatedApiKey | null;
  deadLetterPage: PageState;
  deadLetterSummary: DeadLetterSummary;
  deadLetters: DeadLetterRow[];
  executionPage: PageState;
  executionStatusFilter: string;
  executions: ExecutionRow[];
  health: ServiceHealthMap;
  jobPage: PageState;
  jobStatusFilter: string;
  jobs: JobRow[];
  metrics: MetricsOverview;
  newJob: NewJobFormState;
  editingJobId: string | null;
  users: AuthUser[];
  workerPage: PageState;
  workers: WorkerRow[];
  onAuditFiltersChange: (filters: AuditFilters) => void;
  onApiKeyNameChange: (name: string) => void;
  onCreateJob: (event: React.FormEvent<HTMLFormElement>) => void;
  onCreateApiKey: (event: React.FormEvent<HTMLFormElement>) => void;
  onDeadLetterAction: (messageId: string, action: "requeue" | "discard") => void;
  onDeadLetterPageChange: (page: PageState) => void;
  onExecutionAction: (executionId: string, action: "cancel" | "retry") => void;
  onExecutionPageChange: (page: PageState) => void;
  onExecutionStatusFilterChange: (status: string) => void;
  onCancelJobEdit: () => void;
  onJobAction: (jobId: string, action: "run" | "pause" | "resume" | "edit" | "delete") => void;
  onJobChange: (job: NewJobFormState) => void;
  onJobPageChange: (page: PageState) => void;
  onJobStatusFilterChange: (status: string) => void;
  onRefreshAuditEvents: () => void;
  onRefreshExecutions: (page?: PageState) => void;
  onRefreshDeadLetters: (page?: PageState) => void;
  onRefreshJobs: (page?: PageState) => void;
  onRefreshWorkers: (page?: PageState) => void;
  onRecoverStalled: () => void;
  onRunScheduler: () => void;
  onRevokeApiKey: (apiKeyId: string) => void;
  onUserRoleChange: (userId: string, role: "ADMIN" | "VIEWER") => void;
  onWorkerPageChange: (page: PageState) => void;
};

export function DashboardViews(props: DashboardViewsProps) {
  const isAdmin = props.authUser.role === "ADMIN";

  if (props.activeView === "overview") {
    return <OverviewPanel canMutate={isAdmin} metrics={props.metrics} onRecoverStalled={props.onRecoverStalled} onRunScheduler={props.onRunScheduler} />;
  }

  if (props.activeView === "jobs") {
    return (
      <>
        {isAdmin && <JobCreateForm job={props.newJob} mode={props.editingJobId ? "edit" : "create"} onCancel={props.onCancelJobEdit} onChange={props.onJobChange} onSubmit={props.onCreateJob} />}
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
        <DataPanel title="Jobs" rows={props.jobs} emptyText="No jobs loaded" onJobAction={isAdmin ? props.onJobAction : undefined} />
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
        <DataPanel title="Executions" rows={props.executions} emptyText="No executions loaded" expandableAttempts onExecutionAction={isAdmin ? props.onExecutionAction : undefined} />
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

  if (props.activeView === "deadLetter") {
    return (
      <>
        <DeadLetterPanel
          rows={props.deadLetters}
          summary={props.deadLetterSummary}
          onDiscard={(messageId) => props.onDeadLetterAction(messageId, "discard")}
          onRequeue={(messageId) => props.onDeadLetterAction(messageId, "requeue")}
        />
        <Pager page={props.deadLetterPage} onChange={props.onDeadLetterPageChange} onApply={props.onRefreshDeadLetters} />
      </>
    );
  }

  if (props.activeView === "users") {
    return <UserPanel currentUserId={props.authUser.id} rows={props.users} onRoleChange={props.onUserRoleChange} />;
  }

  if (props.activeView === "apiKeys") {
    return (
      <>
        <ApiKeyCreateForm name={props.apiKeyName} onChange={props.onApiKeyNameChange} onSubmit={props.onCreateApiKey} />
        <ApiKeyPanel rows={props.apiKeys} createdKey={props.createdApiKey} onRevoke={props.onRevokeApiKey} />
      </>
    );
  }

  if (props.activeView === "audit") {
    return (
      <>
        <AuditFilterBar filters={props.auditFilters} onChange={props.onAuditFiltersChange} onApply={props.onRefreshAuditEvents} />
        <AuditPanel rows={props.auditEvents} />
      </>
    );
  }

  return <HealthPanel health={props.health} />;
}
