-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DELETED');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "BackoffType" AS ENUM ('FIXED', 'EXPONENTIAL');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRY_SCHEDULED', 'STALLED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('IDLE', 'BUSY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "method" "HttpMethod" NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "body" JSONB,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "backoffType" "BackoffType" NOT NULL DEFAULT 'EXPONENTIAL',
    "retryInitialDelayMs" INTEGER NOT NULL DEFAULT 1000,
    "retryMaxDelayMs" INTEGER NOT NULL DEFAULT 60000,
    "runAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_schedules" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedByWorkerId" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_messages" (
    "id" TEXT NOT NULL,
    "executionId" TEXT,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceQueue" TEXT NOT NULL,
    "error" TEXT,
    "requeuedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dead_letter_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_attempts" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "workerId" TEXT,
    "status" "AttemptStatus" NOT NULL,
    "httpStatusCode" INTEGER,
    "responseBodyPreview" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "execution_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "serviceInstanceId" TEXT NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'IDLE',
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentExecutionId" TEXT,
    "activeExecutionCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "audit_events_actorType_actorId_idx" ON "audit_events"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "audit_events_resourceType_resourceId_idx" ON "audit_events"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "jobs_status_type_idx" ON "jobs"("status", "type");

-- CreateIndex
CREATE INDEX "jobs_runAt_idx" ON "jobs"("runAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_schedules_jobId_key" ON "job_schedules"("jobId");

-- CreateIndex
CREATE INDEX "job_schedules_nextRunAt_idx" ON "job_schedules"("nextRunAt");

-- CreateIndex
CREATE INDEX "executions_status_scheduledFor_idx" ON "executions"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "executions_nextAttemptAt_idx" ON "executions"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "executions_lockedByWorkerId_idx" ON "executions"("lockedByWorkerId");

-- CreateIndex
CREATE INDEX "dead_letter_messages_createdAt_idx" ON "dead_letter_messages"("createdAt");

-- CreateIndex
CREATE INDEX "dead_letter_messages_executionId_idx" ON "dead_letter_messages"("executionId");

-- CreateIndex
CREATE INDEX "dead_letter_messages_requeuedAt_discardedAt_idx" ON "dead_letter_messages"("requeuedAt", "discardedAt");

-- CreateIndex
CREATE INDEX "execution_attempts_workerId_idx" ON "execution_attempts"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "execution_attempts_executionId_attemptNumber_key" ON "execution_attempts"("executionId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "workers_serviceInstanceId_key" ON "workers"("serviceInstanceId");

-- CreateIndex
CREATE INDEX "workers_status_lastHeartbeatAt_idx" ON "workers"("status", "lastHeartbeatAt");

-- AddForeignKey
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_lockedByWorkerId_fkey" FOREIGN KEY ("lockedByWorkerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_messages" ADD CONSTRAINT "dead_letter_messages_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
