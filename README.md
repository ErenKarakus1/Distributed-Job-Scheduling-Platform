# Distributed Job Scheduling Platform

A microservices-based platform for creating one-time and recurring HTTP jobs, executing them across distributed workers, retrying failures, recovering stalled executions, and monitoring execution history.

## Planned Stack

- Node.js
- Express
- TypeScript
- PostgreSQL
- RabbitMQ
- Redis
- Axios
- Zod
- Prisma
- React + Vite
- Docker

## Services

- `backend/api-gateway`: public API entry point and dashboard aggregation
- `backend/job-service`: job definitions and schedules
- `backend/execution-service`: execution lifecycle, attempts, retries, and recovery state
- `backend/scheduler-service`: due job discovery and queue publishing
- `backend/worker-service`: HTTP execution workers
- `frontend/dashboard`: React web dashboard

## Repository Layout

- `backend/`: Express microservices and backend shared packages
- `frontend/`: React + Vite applications
- `docker-compose.yml`: local PostgreSQL, RabbitMQ, and Redis infrastructure

## Redis Usage

Redis is reserved for fast coordination paths such as rate limiting, short-lived worker presence, scheduler locks, and dashboard metrics caches. Durable job and execution state belongs in PostgreSQL.

## Local Infrastructure

```bash
docker compose up -d postgres rabbitmq redis
```

Docker Compose is currently used for local infrastructure only. Application service Dockerfiles will be added after the core platform is complete.

## Setup

```bash
npm install
copy .env.example .env
npm run db:generate
npm run db:migrate
```

## Development

Run the backend services in separate terminals:

```bash
npm run dev:job-service
npm run dev:execution-service
npm run dev:scheduler-service
npm run dev:worker-service
npm run dev:api-gateway
```

Run the dashboard:

```bash
npm run dev:dashboard
```

Default ports:

- API Gateway: `3000`
- Job Service: `3001`
- Execution Service: `3002`
- Scheduler Service: `3003`
- Worker Service: `3004`
- Dashboard: `5173`

## API Keys

In development, create an API key through the gateway:

```bash
curl -X POST http://localhost:3000/internal/api-keys ^
  -H "content-type: application/json" ^
  -d "{\"name\":\"local-dev\"}"
```

Use the returned key in requests:

```bash
curl http://localhost:3000/api/jobs ^
  -H "x-api-key: djsp_your_key"
```

## Example Job

Create a one-time HTTP job:

```bash
curl -X POST http://localhost:3000/api/jobs ^
  -H "content-type: application/json" ^
  -H "x-api-key: djsp_your_key" ^
  -d "{\"name\":\"Ping example\",\"type\":\"ONE_TIME\",\"method\":\"POST\",\"url\":\"https://httpbin.org/post\",\"runAt\":\"2026-08-02T12:00:00.000Z\"}"
```

Create a recurring HTTP job:

```bash
curl -X POST http://localhost:3000/api/jobs ^
  -H "content-type: application/json" ^
  -H "x-api-key: djsp_your_key" ^
  -d "{\"name\":\"Recurring ping\",\"type\":\"RECURRING\",\"method\":\"GET\",\"url\":\"https://httpbin.org/get\",\"schedule\":{\"cronExpression\":\"*/5 * * * *\",\"timezone\":\"UTC\",\"nextRunAt\":\"2026-08-02T12:00:00.000Z\"}}"
```

Manually run a job:

```bash
curl -X POST http://localhost:3000/api/jobs/JOB_ID/run ^
  -H "x-api-key: djsp_your_key"
```

## Verification

```bash
npm run typecheck
npm run build -w @scheduler/dashboard
```
