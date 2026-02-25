# Docker Architecture Overview

## Network Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   Docker Host Machine                       │
│                   (Your Computer)                           │
│                                                             │
│  Ports exposed to localhost:                               │
│  ├─ http://localhost:5001  ← Node.js Server              │
│  ├─ postgres://localhost:5432  ← PostgreSQL              │
│  └─ localhost:6379  ← Redis                              │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         Docker Internal Network: auction_network      │ │
│  │                                                       │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌─────┐│ │
│  │  │  Node.js Server  │  │   PostgreSQL     │  │Redis││ │
│  │  │  (auction_server)│  │ (auction_postgres)│  │ DB ││ │
│  │  │                  │  │                  │  │     ││ │
│  │  │  Port 5001       │  │  Port 5432       │  │6379 ││ │
│  │  │  (exposed)       │  │  (exposed)       │  │(exp)││ │
│  │  │                  │  │                  │  │     ││ │
│  │  │  Uses DNS names: │  │                  │  │     ││ │
│  │  │  - postgres:5432 │  │  Volume:         │  │Vol: ││ │
│  │  │  - redis:6379    │  │  postgres_data   │  │redis││ │
│  │  │                  │  │                  │  │_data││ │
│  │  └──────────────────┘  └──────────────────┘  └─────┘│ │
│  │         (Services communicate internally)            │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## How Docker Names (DNS) Work

Inside Docker containers, services can reference each other by name:

| What | Where | Uses |
|------|-------|------|
| `localhost:5001` | Your computer | Access server from browser/postman |
| `postgres:5432` | Inside server container | DATABASE_URL points here |
| `redis:6379` | Inside server container | REDIS_HOST points here |

## Startup Sequence

```
┌─ docker compose up -d --build
│
├─ Step 1: Build server image from Dockerfile
│          └─ Install dependencies
│             Generate Prisma client
│             Copy source code
│
├─ Step 2: Create Docker network (auction_network)
│
├─ Step 3: Start PostgreSQL container
│          └─ Wait for health check (pg_isready)
│             Expose :5432 to localhost:5432
│
├─ Step 4: Start Redis container
│          └─ Expose :6379 to localhost:6379
│
└─ Step 5: Start Node.js server container
           └─ Wait for postgres to be healthy
              Connect to postgres:5432 (internal DNS)
              Connect to redis:6379 (internal DNS)
              Expose :5001 to localhost:5001
```

## Environment Variables Mapping

**In docker-compose.yml, database URL changes automatically:**

```yaml
# OLD (runs on your machine)
DATABASE_URL: postgresql://pizzosta:pizzosta@localhost:5432/auction_website

# NEW (runs in Docker container)
DATABASE_URL: postgresql://pizzosta:pizzosta@postgres:5432/auction_website
                                          ↑
                                   Service name (Docker DNS)
```

## Volume Persistence

```
Docker Volumes (named storage):
├─ postgres_data
│  └─ Stores all database files
│     └─ Survives: container restart, container removal
│     └─ Lost only with: docker compose down -v
│
└─ redis_data
   └─ Stores Redis data if configured
      └─ Survives: container restart, container removal
      └─ Lost only with: docker compose down -v
```

## Container Health Checks

Each service has a health check that docker-compose monitors:

```
PostgreSQL:
├─ Command: pg_isready -U pizzosta -d auction_website
├─ Runs: Every 10 seconds
└─ Status: healthy when server responds

Redis:
├─ Command: redis-cli ping
├─ Runs: Every 10 seconds
└─ Status: healthy when server responds with PONG

Node.js Server:
├─ Command: HTTP request to http://localhost:5001/health
├─ Runs: Every 30 seconds (after 40s startup time)
└─ Status: healthy when returns 200 status
```

## File Copy During Build (Multi-stage)

```
Stage 1 (Builder):
├─ FROM node:22-alpine
├─ COPY package*.json
├─ npm ci (install all deps)
├─ COPY src
├─ npm run prisma:generate (builds client)
└─ Result: Large intermediate image with all dev deps

Stage 2 (Production):
├─ FROM node:22-alpine (fresh slim image)
├─ COPY package*.json
├─ npm ci --omit=dev (only prod deps)
├─ COPY node_modules/.prisma (from builder)
├─ COPY prisma/ (from builder)
├─ COPY src
└─ Result: Smaller production image
```

## Database Connection Flow

```
Your Code:
│
├─ Prisma ORM reads DATABASE_URL env var
│  └─ Uses: postgresql://pizzosta:pizzosta@postgres:5432/auction_website
│
├─ Docker's internal DNS resolves "postgres" to container IP
│  └─ Example: postgres → 172.18.0.2
│
├─ Connection established to PostgreSQL container
│  └─ Port 5432 (internal)
│
└─ Queries execute successfully
   └─ Data persisted in postgres_data volume
```

## Accessing Data from Your Machine

```bash
# From inside Docker (automatic via DNS)
docker compose exec server psql -h postgres -U pizzosta -d auction_website

# From your machine (via exposed port)
psql -h localhost -U pizzosta -d auction_website

# From your machine (via connection string)
postgresql://pizzosta:pizzosta@localhost:5432/auction_website
```

## Common Flow: Running Migrations

```
docker compose exec server npm run prisma:migrate
│
├─ Executes in: auction_server container
├─ Reads DATABASE_URL: postgresql://pizzosta:pizzosta@postgres:5432/...
├─ Connects to: postgres container on auction_network
├─ Runs migrations against connected database
└─ Updates: postgres_data volume
```

## Cleanup & Fresh Start

```bash
# Keeps data (restart from same state)
docker compose down
docker compose up -d --build

# Deletes data (fresh database)
docker compose down -v
docker compose up -d --build
docker compose exec server npm run prisma:migrate
```

---

**Key Takeaway:** Docker creates an isolated network where services communicate by name, while your machine accesses them via `localhost:PORT`. The `.env` variables in docker-compose.yml automatically set service names (postgres, redis) instead of localhost, making the containers work together seamlessly.
