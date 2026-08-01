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
