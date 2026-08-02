# Distributed Job Scheduling Platform

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?logo=open-source-initiative&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-green.svg?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-black.svg?logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg?logo=postgresql&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.13-orange.svg?logo=rabbitmq&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-red.svg?logo=redis&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg?logo=docker&logoColor=white)
![CI](https://github.com/ErenKarakus1/Distributed-Job-Scheduling-Platform/actions/workflows/ci.yml/badge.svg)

A microservices-based distributed HTTP job scheduling platform for creating one-time and recurring jobs, executing them across workers, retrying failures, recovering stalled executions, tracking dead-lettered work, and monitoring execution history through an API and web dashboard.

Developers can create HTTP jobs, schedule future or recurring runs, inspect attempts and response metadata, manually retry failed executions, recover stalled work, inspect and requeue dead-letter messages, manage dashboard users, authenticate with JWTs or developer API keys, and run the full platform locally with Docker Compose.

## Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [How It Works](#how-it-works)
- [Retry and Recovery](#retry-and-recovery)
- [Dead Letter Queue](#dead-letter-queue)
- [Authentication and Authorization](#authentication-and-authorization)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Run with Docker](#run-with-docker)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [API Examples](#api-examples)
- [Main API Routes](#main-api-routes)
- [Tests and Checks](#tests-and-checks)
- [Smoke Test](#smoke-test)
- [Continuous Integration](#continuous-integration)
- [Testing Retries](#testing-retries)
- [Testing Stalled Recovery](#testing-stalled-recovery)
- [Testing Dead Letter Messages](#testing-dead-letter-messages)
- [Design Decisions](#design-decisions)
- [Known Limitations](#known-limitations)
- [Security Notes](#security-notes)
- [Possible Future Improvements](#possible-future-improvements)
- [License](#license)

## Tech Stack

### Backend

- Node.js
- Express
- TypeScript
- Zod
- Axios
- Prisma
- PostgreSQL
- RabbitMQ
- Redis

### Frontend

- React
- TypeScript
- Vite

### Infrastructure

- Docker
- Docker Compose
- Nginx for serving the built dashboard frontend

## Features

- Express microservices architecture
- One-time HTTP jobs
- Recurring cron-based HTTP jobs
- Manual job runs
- Job pause, resume, update, and delete operations
- Distributed execution through RabbitMQ
- Worker concurrency configuration
- HTTP execution attempts with status, duration, response code, response body preview, and error details
- Automatic retry with fixed or exponential backoff
- Retry delay caps
- Manual execution retry
- Stalled execution heartbeat recovery
- Dead-letter records for exhausted executions and malformed queue messages
- Admin dead-letter dashboard with requeue and discard actions
- Worker registry and worker health reporting
- Execution history and pagination
- Dashboard metrics overview
- Audit event timeline
- JWT dashboard authentication
- API key authentication for developer/API access
- Admin and viewer roles
- Admin bootstrap command for Docker and local setup
- Redis-backed API rate limiting
- PostgreSQL persistence with Prisma
- Squashed initial Prisma migration
- React dashboard for jobs, executions, workers, dead letters, metrics, health, and audit events
- Dockerized local platform stack
- Docker smoke test
- GitHub Actions CI
- Backend and dashboard unit tests with TypeScript checks

## How It Works

Jobs are stored durably in PostgreSQL. A job can be either:

- `ONE_TIME` - runs once at a configured `runAt` time
- `RECURRING` - runs repeatedly from a cron expression and timezone

The scheduler service scans for due jobs and creates execution records. Scheduler instances coordinate with a PostgreSQL advisory lock so multiple schedulers do not create the same due executions at the same time. Scheduler instances that cannot acquire the lock skip that polling run and try again later. Runnable executions are published to RabbitMQ through the `execution.ready` queue.

Worker instances consume queued execution messages, mark executions as running, send heartbeat updates while work is active, perform the configured HTTP request with Axios, and record the attempt result.

If a job fails and has retry attempts remaining, the execution service schedules the next attempt using the job's backoff settings. If an execution stops heartbeating for too long, stalled recovery can move it back to a retryable state or fail it when no attempts remain.

## Retry and Recovery

Retries are controlled per job.

Retry configuration includes:

- `maxAttempts`
- `retryDelayMs`
- `retryMaxDelayMs`
- `backoffType`

Supported backoff types:

- `FIXED`
- `EXPONENTIAL`

The worker records failed, timed-out, and successful attempts. The execution service decides whether another attempt should be queued, delayed, or whether the execution should become terminal. Manual retries are available for failed or canceled executions while their linked job is still active.

Stalled recovery uses worker heartbeats. If an execution is `RUNNING` but its heartbeat is older than the configured stalled threshold, recovery can mark it for retry or fail it when retry attempts are exhausted.

## Dead Letter Queue

Terminal failed executions are written to a PostgreSQL-backed dead-letter table after their configured retry attempts are exhausted. Malformed RabbitMQ execution messages are also recorded before being rejected into RabbitMQ's dead-letter queue.

The admin dashboard includes a Dead Letter view for:

- active dead-letter message count
- oldest active dead-letter timestamp
- reason, source queue, linked execution, linked job, error, and payload preview
- requeueing a linked execution back to `PENDING` when the linked job still exists and is active
- discarding a dead-letter message from the active queue

The dashboard uses PostgreSQL for dead-letter inspection because RabbitMQ queues are not designed to be a long-term queryable audit store.

## Authentication and Authorization

The API gateway supports two authentication methods for `/api/*` routes.

### JWT

Dashboard users authenticate with email and password. Login returns a JWT that the dashboard stores locally and sends as a bearer token.

JWT roles:

- `ADMIN` - can read and mutate jobs, executions, scheduling, recovery, dead letters, users, and API keys
- `VIEWER` - can read non-sensitive dashboard data without mutation controls

### API Keys

API keys are intended for developer and service access to non-admin platform API routes. Admin-only mutations require an authenticated `ADMIN` JWT, not an API key.

The gateway hashes API keys before storing them. Plain API key values are only returned when the key is created.

## Architecture

```mermaid
flowchart LR
    User[User or Developer] --> Dashboard[React Dashboard]
    User --> Client[HTTP Client]

    Dashboard -->|JWT| Gateway[API Gateway]
    Client -->|API Key or JWT| Gateway

    Gateway --> Jobs[Job Service]
    Gateway --> Executions[Execution Service]
    Gateway --> Scheduler[Scheduler Service]
    Gateway --> Workers[Worker Service]

    Gateway <--> Redis[(Redis Rate Limits)]

    Jobs --> Postgres[(PostgreSQL)]
    Executions --> Postgres
    Scheduler --> Postgres
    Workers --> Postgres
    Gateway --> Postgres

    Scheduler -->|Publish due executions| RabbitMQ[(RabbitMQ)]
    RabbitMQ -->|execution.ready| Workers
    RabbitMQ -->|malformed messages| DeadLetters[Dead Letter Records]
    Workers -->|HTTP request| Target[External HTTP Endpoint]
    Workers --> Executions

    Executions -->|Retry or recover| RabbitMQ
    Executions -->|exhausted failures| DeadLetters
    DeadLetters --> Postgres
```

## Project Structure

```text
backend/
  api-gateway/
    src/
      auth/              JWT, users, API keys, and admin bootstrap
      audit-routes.ts    Audit event API
      proxy-routes.ts    Public API proxy routes
  job-service/
    src/
      command-routes.ts  Job mutations and manual runs
      read-routes.ts     Job reads
      validation.ts      Job schemas
  execution-service/
    src/
      command-routes.ts  Execution state changes, attempts, retry, recovery, dead letters
      read-routes.ts     Executions, workers, dead letters, and metrics
      recovery.ts        Stalled execution recovery rules
      retry.ts           Retry delay and backoff rules
  scheduler-service/
    src/
      scheduler.ts       Due job discovery and queue publishing
      cron.ts            Recurring schedule calculation
      stats.ts           Queue statistics
  worker-service/
    src/
      worker.ts          RabbitMQ consumer
      execution.ts       HTTP execution and attempt handling
      worker-state.ts    Worker presence and heartbeat state
  packages/
    database/
      prisma/            Prisma schema and migration
      src/               Shared Prisma client
frontend/
  dashboard/
    src/
      api/               Dashboard API client and request builders
      components/        Shared dashboard panels and controls
      layouts/           Dashboard shell, sidebar, toolbar, and signed-in strip
      pages/             Login/register page and dashboard view composition
      state/             Dashboard state helpers
      app.tsx            Main dashboard application
docker-compose.yml       Full local platform stack
```

## Requirements

### Docker Setup

- Docker
- Docker Compose

### Local Development

- Node.js 22 or newer
- npm
- Docker, or locally installed PostgreSQL, RabbitMQ, and Redis

## Run with Docker

### 1. Clone the repository

```bash
git clone https://github.com/ErenKarakus1/Distributed-Job-Scheduling-Platform.git
cd Distributed-Job-Scheduling-Platform
```

### 2. Optional: configure local secrets

Docker Compose provides local defaults, including an admin user.

For a custom admin account, create a root-level `.env` file or set these values in your shell:

```env
ADMIN_EMAIL="admin@example.com"
ADMIN_NAME="Platform Admin"
ADMIN_PASSWORD="change-me-admin-password"
JWT_SECRET="change-me-in-docker"
```

Use stronger values before deploying anywhere outside local development.

### 3. Start the application

```bash
docker compose up --build
```

Open:

- Dashboard: http://localhost:8080
- API Gateway: http://localhost:3000
- API health check: http://localhost:3000/health
- Service health check: http://localhost:3000/health/services
- RabbitMQ management: http://localhost:15672

Default RabbitMQ credentials:

```text
scheduler / scheduler
```

The dashboard opens to a dedicated login/register page. Docker Compose bootstraps the default admin account from `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD`.

Docker Compose starts:

- `dashboard` - React dashboard frontend served by Nginx
- `api-gateway` - public API, auth, rate limiting, and service aggregation
- `job-service` - job definitions and schedules
- `execution-service` - execution lifecycle, attempts, retry, recovery, workers, and metrics
- `scheduler-service` - due job discovery and RabbitMQ publishing
- `worker-service` - distributed HTTP executor
- `migrations` - Prisma migration deployment
- `admin-bootstrap` - local admin user creation
- `postgres` - durable platform database
- `rabbitmq` - execution queue and management UI
- `redis` - shared API rate-limit store

### View running services

```bash
docker compose ps
```

### View logs

```bash
docker compose logs -f api-gateway
docker compose logs -f job-service
docker compose logs -f execution-service
docker compose logs -f scheduler-service
docker compose logs -f worker-service
docker compose logs -f dashboard
```

### Stop the application

```bash
docker compose down
```

### Stop the application and remove stored data

```bash
docker compose down -v
```

This removes the PostgreSQL volume created by Docker Compose.

## Environment Configuration

The environment template is located at:

```text
.env.example
```

Create your local configuration at:

```text
.env
```

Docker Compose sets container-safe defaults in `docker-compose.yml`. For local development outside Docker, `.env.example` uses host-accessible URLs.

### Application configuration

```env
NODE_ENV=development
```

### Database configuration

```env
DATABASE_URL=postgresql://scheduler:scheduler@localhost:5432/scheduler
```

When services run through Docker Compose, this becomes:

```text
postgresql://scheduler:scheduler@postgres:5432/scheduler
```

### RabbitMQ configuration

```env
RABBITMQ_URL=amqp://scheduler:scheduler@localhost:5672
EXECUTION_READY_QUEUE=execution.ready
EXECUTION_DEAD_LETTER_EXCHANGE=execution.dead
EXECUTION_DEAD_LETTER_QUEUE=execution.dead
```

When services run through Docker Compose, RabbitMQ is reached at:

```text
amqp://scheduler:scheduler@rabbitmq:5672
```

Malformed execution messages are rejected into the dead-letter queue.

### Redis configuration

```env
REDIS_URL=redis://localhost:6379
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=120
```

Set `API_RATE_LIMIT_MAX_REQUESTS=0` to disable the API limiter during local experiments.

### Authentication configuration

```env
JWT_SECRET=change-me-in-development
JWT_EXPIRES_IN=8h
ADMIN_EMAIL=admin@example.com
ADMIN_NAME=Platform Admin
ADMIN_PASSWORD=change-me-admin-password
```

The example JWT secret and admin password are intended only for local development.

### Service ports

```env
API_GATEWAY_PORT=3000
JOB_SERVICE_PORT=3001
EXECUTION_SERVICE_PORT=3002
SCHEDULER_SERVICE_PORT=3003
WORKER_SERVICE_PORT=3004
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
VITE_API_BASE_URL=http://localhost:3000
```

### Worker and scheduler configuration

```env
WORKER_CONCURRENCY=1
SCHEDULER_POLL_INTERVAL_MS=5000
SCHEDULER_BATCH_SIZE=50
EXECUTION_STALLED_AFTER_MS=60000
EXECUTION_RECOVERY_INTERVAL_MS=15000
EXECUTION_RECOVERY_BATCH_SIZE=50
```

Do not commit `.env` or any real API keys, JWT secrets, database passwords, access tokens, or production secrets.

## Local Development

The recommended local-development setup runs PostgreSQL, RabbitMQ, and Redis through Docker while the Node.js services and dashboard run directly on your machine.

### 1. Start infrastructure

```bash
docker compose up -d postgres rabbitmq redis
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Linux and macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4. Generate Prisma client and run migrations

```bash
npm run db:generate
npm run db:migrate
```

For production-style migration deployment:

```bash
npm run db:deploy
```

### 5. Bootstrap an admin user

```bash
npm run bootstrap:admin
```

### 6. Start backend services

Run each service in a separate terminal:

```bash
npm run dev:job-service
npm run dev:execution-service
npm run dev:scheduler-service
npm run dev:worker-service
npm run dev:api-gateway
```

### 7. Start the dashboard

```bash
npm run dev:dashboard
```

Open:

- Dashboard: http://localhost:5173
- API Gateway: http://localhost:3000
- Health check: http://localhost:3000/health
- RabbitMQ management: http://localhost:15672

The dashboard opens to a dedicated login/register page. Use the admin account created by `npm run bootstrap:admin`, or register a development user from the dashboard.

## API Examples

The multiline `curl` examples use Unix-style line continuations with `\`.

In Windows PowerShell, either run each example on one line or replace `\` line continuations with PowerShell backticks.

### Register and login

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","name":"Admin","password":"password123"}'
```

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
```

Use the returned token:

```bash
curl http://localhost:3000/api/jobs \
  -H "authorization: Bearer YOUR_JWT"
```

### Create an API key

```bash
curl -X POST http://localhost:3000/internal/api-keys \
  -H "content-type: application/json" \
  -H "authorization: Bearer YOUR_ADMIN_JWT" \
  -d '{"name":"local-dev"}'
```

Use the returned key for non-admin API reads:

```bash
curl http://localhost:3000/api/jobs \
  -H "x-api-key: djsp_your_key"
```

### Create a one-time job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "content-type: application/json" \
  -H "authorization: Bearer YOUR_ADMIN_JWT" \
  -d '{
    "name": "Ping example",
    "type": "ONE_TIME",
    "method": "POST",
    "url": "https://httpbin.org/post",
    "runAt": "2026-08-02T12:00:00.000Z",
    "maxAttempts": 3,
    "retryDelayMs": 1000,
    "retryMaxDelayMs": 30000,
    "backoffType": "EXPONENTIAL"
  }'
```

### Create a recurring job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "content-type: application/json" \
  -H "authorization: Bearer YOUR_ADMIN_JWT" \
  -d '{
    "name": "Recurring ping",
    "type": "RECURRING",
    "method": "GET",
    "url": "https://httpbin.org/get",
    "schedule": {
      "cronExpression": "*/5 * * * *",
      "timezone": "UTC",
      "nextRunAt": "2026-08-02T12:00:00.000Z"
    }
  }'
```

### Manually run a job

```bash
curl -X POST http://localhost:3000/api/jobs/JOB_ID/run \
  -H "authorization: Bearer YOUR_ADMIN_JWT"
```

### Retry an execution

```bash
curl -X POST http://localhost:3000/api/executions/EXECUTION_ID/retry \
  -H "authorization: Bearer YOUR_ADMIN_JWT"
```

### Recover stalled executions

```bash
curl -X POST http://localhost:3000/api/recover/stalled \
  -H "authorization: Bearer YOUR_ADMIN_JWT"
```

### Run the scheduler once

```bash
curl -X POST http://localhost:3000/api/schedule/run \
  -H "authorization: Bearer YOUR_ADMIN_JWT"
```

## Main API Routes

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### Jobs

- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `PATCH /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `POST /api/jobs/:id/run`
- `POST /api/jobs/:id/pause`
- `POST /api/jobs/:id/resume`

### Executions

- `GET /api/executions`
- `POST /api/executions`
- `GET /api/executions/:id`
- `POST /api/executions/:id/cancel`
- `POST /api/executions/:id/retry`

### Operations and Monitoring

- `GET /api/workers`
- `GET /api/dead-letter`
- `POST /api/dead-letter/:id/requeue`
- `DELETE /api/dead-letter/:id`
- `GET /api/metrics/overview`
- `GET /api/audit-events`
- `POST /api/schedule/run`
- `POST /api/recover/stalled`
- `GET /health`
- `GET /health/services`

### Internal Admin Routes

- `POST /internal/api-keys`
- `GET /internal/api-keys`
- `DELETE /internal/api-keys/:id`
- `GET /internal/users`
- `PATCH /internal/users/:id/role`

## Tests and Checks

Run all backend tests:

```bash
npm test
```

Run TypeScript checks across all workspaces:

```bash
npm run typecheck
```

Build all workspaces:

```bash
npm run build
```

Build only the dashboard:

```bash
npm run build -w @scheduler/dashboard
```

Generate Prisma client:

```bash
npm run db:generate
```

Validate Docker Compose configuration:

```bash
docker compose config
```

## Smoke Test

The smoke test expects the platform to be running and reachable through the API gateway.

Start the Docker stack:

```bash
docker compose up -d --build
```

Run the smoke test:

```bash
npm run smoke
```

The smoke test checks:

- API gateway health
- downstream service health aggregation
- admin login
- API key creation
- job creation
- manual job execution creation
- scheduler trigger endpoint
- execution listing
- stalled recovery endpoint
- dead-letter listing
- metrics overview
- audit event listing

Optional smoke test environment variables:

```env
SMOKE_BASE_URL=http://localhost:3000
SMOKE_ADMIN_EMAIL=admin@example.com
SMOKE_ADMIN_PASSWORD=change-me-admin-password
SMOKE_HEALTH_TIMEOUT_MS=120000
```

## Continuous Integration

GitHub Actions runs on pushes and pull requests to `master`.

The workflow performs:

- dependency installation with `npm ci`
- Prisma client generation
- backend unit tests
- TypeScript checks
- dashboard production build
- Docker Compose configuration validation
- full Docker stack boot
- API smoke test
- Docker cleanup with volume removal

## Testing Retries

To test retry behavior:

1. Create a job that targets an endpoint returning a `500` response.
2. Set `maxAttempts` greater than `1`.
3. Use `FIXED` or `EXPONENTIAL` backoff.
4. Run the scheduler or manually run the job.
5. Inspect `/api/executions/:id` and the dashboard execution history.

Each failed HTTP call should create an attempt record. The execution should retry until it succeeds or reaches the configured maximum attempt count.

## Testing Stalled Recovery

To test stalled recovery:

1. Start the Docker stack.
2. Create and run a job.
3. Stop the worker while an execution is running.
4. Wait longer than `EXECUTION_STALLED_AFTER_MS`.
5. Call `POST /api/recover/stalled` or wait for the recovery loop.
6. Confirm that the execution is retried or failed based on remaining attempts.

## Testing Dead Letter Messages

To test dead-letter handling:

1. Create a job that targets an endpoint returning a `500` response.
2. Set `maxAttempts` to `1`.
3. Run the scheduler or manually run the job.
4. Open the Dead Letter dashboard view as an admin, or call `GET /api/dead-letter`.
5. Confirm the failed execution appears with reason `MAX_ATTEMPTS_EXHAUSTED`.
6. Use Requeue to move the linked execution back to `PENDING`, then run the scheduler again.
7. Use Discard to remove a message from the active dead-letter list when no further action is needed.

## Design Decisions

### Microservices

The backend is split by responsibility: gateway, jobs, executions, scheduler, and workers. This keeps scheduling, execution state, and HTTP work isolated while still allowing the dashboard to use one API gateway.

### PostgreSQL and Prisma

Jobs, schedules, executions, attempts, workers, dead-letter messages, users, API keys, and audit events are relational and queryable. PostgreSQL with Prisma keeps those relationships explicit and provides a migration workflow.

### RabbitMQ

RabbitMQ handles runnable execution delivery to distributed workers. Workers can scale horizontally by adding more consumers to the same queue.

### Scheduler Coordination

Scheduler instances coordinate through a PostgreSQL transaction-level advisory lock. Before scanning due jobs, a scheduler tries to acquire the lock. Only the instance that acquires it may scan due jobs and create scheduled executions; other scheduler instances skip that polling cycle and try again on the next poll.

PostgreSQL releases the transaction-level lock when the scheduler run transaction finishes. If the scheduler process or database connection fails, PostgreSQL also releases the lock as part of ending that transaction.

The lock coordinates scheduler leadership only. It does not serialize worker execution, so RabbitMQ workers can continue processing jobs concurrently.

### Dead Letters

RabbitMQ is used for message delivery and rejection behavior, while PostgreSQL stores the dashboard-facing dead-letter records. That keeps failed work queryable, auditable, and actionable through the API without relying on RabbitMQ queue browsing as an application database.

### Redis

Redis is used for shared API rate limiting in the gateway. Durable platform state and scheduler coordination remain in PostgreSQL.

### JWT and API Keys

JWTs are used for dashboard sessions and role-aware admin access. API keys are used for non-admin developer and service-to-service access where a long-lived credential is more convenient than an interactive login.

### Retry and Recovery

Retries are stored as part of execution state instead of being hidden inside worker memory. That makes retry behavior inspectable and recoverable after service restarts.

## Known Limitations

- Docker Compose is intended for local development and demonstration, not hardened production deployment.
- JWTs are stored by the dashboard in browser local storage. A production deployment could move refresh/session handling to HttpOnly cookies.
- Rate limiting uses a fixed-window Redis counter.
- Service-to-service calls inside the Docker network are trusted by local Compose configuration.
- There is no OpenAPI document yet.
- Cron scheduling depends on the scheduler service polling interval.
- Dead-letter requeue returns active linked executions to `PENDING`; malformed messages without an execution link, or messages linked to deleted jobs, can only be discarded from the dashboard record.
- RabbitMQ and PostgreSQL are exposed on localhost for local development convenience.

## Security Notes

- Never commit `.env`.
- Never commit real API keys, JWTs, database URLs, passwords, RabbitMQ credentials, or production secrets.
- Replace `JWT_SECRET` before deployment.
- Replace the default admin password before deployment.
- Restrict production CORS origins.
- Use strong database and RabbitMQ credentials in production.
- Do not expose PostgreSQL, RabbitMQ, or Redis publicly.
- Use TLS for deployed services.
- Treat the included Docker Compose configuration as a local-development setup.

## Possible Future Improvements

- OpenAPI specification
- Frontend component and integration tests
- Refresh-token flow with HttpOnly cookies
- Transactional outbox for stronger RabbitMQ publish consistency
- Multi-tenant organizations
- Worker autoscaling notes
- Metrics export for Prometheus
- Structured tracing across services
- Webhook signing for outgoing HTTP jobs
- Production deployment manifests

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
