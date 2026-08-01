# Distributed Job Scheduling Platform

A microservices-based platform for creating one-time and recurring HTTP jobs, executing them across distributed workers, retrying failures, recovering stalled executions, and monitoring execution history.

## Planned Stack

- Node.js
- Express
- TypeScript
- PostgreSQL
- RabbitMQ
- Axios
- Zod
- Prisma
- React + Vite
- Docker

## Services

- `api-gateway`: public API entry point and dashboard aggregation
- `job-service`: job definitions and schedules
- `execution-service`: execution lifecycle, attempts, retries, and recovery state
- `scheduler-service`: due job discovery and queue publishing
- `worker-service`: HTTP execution workers
- `dashboard`: React web dashboard

## Local Infrastructure

```bash
docker compose up -d postgres rabbitmq
```

