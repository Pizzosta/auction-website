# Docker Setup Guide for Auction Website

## Overview
Your application stack includes:
- **Node.js Server** (port 5001)
- **PostgreSQL** (port 5432)
- **Redis** (port 6379)

All run in isolated Docker containers that communicate via a custom network.

## Prerequisites

1. **Docker Desktop installed** - Download from [docker.com](https://docker.com)
2. **Docker running** - Verify: `docker --version && docker compose --version`

## Configuration Changes Made

### 1. **Dockerfile** (`server/Dockerfile`)
- Multi-stage build for optimized image size
- Uses Alpine Linux (lightweight)
- Generates Prisma client during build
- Includes health checks
- Copies only necessary files to production stage

### 2. **docker-compose.yml** (Updated)
- **Postgres Service**: Database (changed from `postgres:16` to `postgres:16-alpine` for smaller size)
- **Server Service**: Your Node.js app (built from Dockerfile)
- **Redis Service**: Cache layer (added)
- **Custom Network**: Allows services to communicate using service names as DNS
  - `postgres` → internal DNS for database
  - `redis` → internal DNS for cache
  - Postgres on port 5432 (internal), exposed to localhost:5432
  - Server on port 5001 (exposed to localhost:5001)

### 3. **.dockerignore** (New)
- Prevents unnecessary files from being copied into the image
- Reduces build size and time

### 4. **Key Changes in docker-compose.yml**:

**For the Server:**
- `DATABASE_URL` now uses `postgres:5432` instead of `localhost:5432`
- `REDIS_HOST` now uses `redis` instead of `127.0.0.1`
- These work because Docker's internal network resolves service names to IP addresses
- Set `NODE_ENV=production` for the container
- Health check ensures server is ready before treating it as healthy

**Network Setup:**
- All services on `auction_network` bridge network
- Services can reach each other by name
- Your machine can reach via `localhost:PORT`

## Step-by-Step Process

### Step 1: Prepare Your Local Machine
```bash
# Stop your local PostgreSQL and Redis if running
# (Only needed if they conflict with Docker ports)

# Navigate to server directory
cd /Users/pizzosta/Desktop/CODING/auction-website/server
```

### Step 2: Build Docker Images
```bash
# Build and start all services (from server directory)
docker compose up -d --build

# This will:
# 1. Build the Node.js server image from Dockerfile
# 2. Pull PostgreSQL 16 Alpine image
# 3. Pull Redis 7 Alpine image
# 4. Create the auction_network
# 5. Start all three containers
```

### Step 3: Wait for Services to Be Healthy
```bash
# Check service status
docker compose ps

# Expected output:
# NAME                STATUS              PORTS
# auction_postgres    Up (healthy)        0.0.0.0:5432->5432/tcp
# auction_redis       Up (healthy)        0.0.0.0:6379->6379/tcp
# auction_server      Up (healthy)        0.0.0.0:5001->5001/tcp
```

### Step 4: Run Database Migrations
```bash
# Get inside the server container and run migrations
docker compose exec server npm run prisma:migrate

# Or setup initial database (if needed)
docker compose exec server npm run create-users
```

### Step 5: Verify Services
```bash
# Check server logs
docker compose logs server

# Check database connection
docker compose exec postgres psql -U pizzosta -d auction_website -c "\dt"

# Check Redis connection
docker compose exec redis redis-cli ping
# Should return: PONG
```

### Step 6: Access Your Application
- **Server API**: http://localhost:5001
- **Swagger Docs**: http://localhost:5001/api-docs (if enabled)
- **Database (local machine)**: `postgresql://pizzosta:pizzosta@localhost:5432/auction_website`

## Troubleshooting

### Issue: Port Already in Use
```bash
# If port 5432 or 5001 is already in use, either:

# Option A: Stop conflicting services
lsof -i :5001  # Find process on port 5001
kill -9 <PID>

# Option B: Change docker-compose.yml ports:
# Change "5001:5001" to "5002:5001" to use 5002 locally
```

### Issue: Container Won't Start
```bash
# Check logs
docker compose logs server

# Check for environment variable issues
docker compose exec server env | grep DATABASE

# Rebuild without cache
docker compose up -d --build --no-cache
```

### Issue: Database Connection Failed
```bash
# Verify postgres is healthy
docker compose logs postgres

# Try connecting manually
docker compose exec postgres psql -U pizzosta -d auction_website

# Check if port is exposed
docker compose port postgres 5432
```

### Issue: Redis Connection Issues
```bash
# Verify Redis is running
docker compose exec redis redis-cli ping

# Check logs
docker compose logs redis
```

## Common Commands

```bash
# Start services in background
docker compose up -d

# Start services with logs visible
docker compose up

# Stop all services (keep data)
docker compose stop

# Stop and remove containers (keep volumes)
docker compose down

# Remove everything including volumes (fresh start)
docker compose down -v

# View logs
docker compose logs -f          # all services
docker compose logs server      # specific service
docker compose logs --tail 100  # last 100 lines

# Execute command in running container
docker compose exec server npm run lint
docker compose exec server npm test

# Access container shell
docker compose exec server /bin/sh
docker compose exec postgres psql -U pizzosta -d auction_website

# Rebuild specific service
docker compose up -d --build server

# Remove unused resources
docker system prune -a
```

## Important Notes

### 1. **Database URL in Docker Context**
- **Local**: `postgresql://pizzosta:pizzosta@localhost:5432/auction_website`
- **Docker**: `postgresql://pizzosta:pizzosta@postgres:5432/auction_website`
- The server container uses the Docker URL automatically via environment variables

### 2. **DKIM Key Path**
- Changed from local path to `/app/src/config/keys/dkim-private.pem`
- Make sure this file exists in your server before building:
  ```bash
  ls server/src/config/keys/dkim-private.pem
  ```

### 3. **Production vs Development**
- Current docker-compose uses `NODE_ENV=production`
- For development, change to `NODE_ENV=development` and mount volumes for hot-reload

### 4. **Secret Keys**
- Don't commit `.env` with real secrets to Git
- Use `.env.example` for the team and override with `.env` locally
- For production, use Docker secrets or environment variable management services

### 5. **Data Persistence**
- Postgres data stored in `postgres_data` volume (survives container restarts)
- Redis data stored in `redis_data` volume
- Remove with `docker compose down -v` if you want fresh database

## Next Steps

1. **Test locally**: `docker compose up -d --build` and verify all services start
2. **Run migrations**: `docker compose exec server npm run prisma:migrate`
3. **Test API**: `curl http://localhost:5001/health` (if endpoint exists)
4. **Check logs**: `docker compose logs -f server`
5. **For CI/CD**: Consider using DockerHub or a container registry

---

**Need help?** Run `docker compose logs <service>` to see detailed error messages.
