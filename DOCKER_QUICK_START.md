# Docker Quick Start - Cheat Sheet

## 🚀 Quick Start (3 Commands)

```bash
# 1. Build and start all services
cd server
docker compose up -d --build

# 2. Run database migrations
docker compose exec server npm run prisma:migrate

# 3. Verify everything is running
docker compose ps
```

## ✅ Verify Setup

```bash
# Check all services are healthy
docker compose ps

# Test server API
curl http://localhost:5001

# Test database
docker compose exec postgres psql -U pizzosta -d auction_website -c "SELECT version();"

# Test Redis
docker compose exec redis redis-cli ping
```

## 📊 Check Status & Logs

```bash
# Show all containers
docker compose ps

# View logs from all services
docker compose logs -f

# View logs from specific service
docker compose logs -f server    # Node.js server
docker compose logs -f postgres  # Database
docker compose logs -f redis     # Cache

# Last 50 lines of logs
docker compose logs --tail 50
```

## 🔧 Manage Services

```bash
# Stop all (data preserved)
docker compose stop

# Start all (already running)
docker compose start

# Restart all
docker compose restart

# Stop and remove containers (keep data volumes)
docker compose down

# Stop and remove everything (fresh start - DELETES DATA)
docker compose down -v
```

## 🛠️ Development Commands

```bash
# Install new npm packages
docker compose exec server npm install package-name

# Run linter
docker compose exec server npm run lint

# Run tests
docker compose exec server npm test

# Create admin user
docker compose exec server npm run create-users

# Access server shell
docker compose exec server /bin/sh

# Access database shell
docker compose exec postgres psql -U pizzosta -d auction_website

# Access Redis CLI
docker compose exec redis redis-cli
```

## 🐛 Troubleshooting

```bash
# Port already in use (find what's using port 5001)
lsof -i :5001

# Force rebuild (no cache)
docker compose up -d --build --no-cache

# Check if port is exposed
docker compose port server 5001    # Should show 0.0.0.0:5001

# View environment variables in container
docker compose exec server env | sort

# Run migrations again
docker compose exec server npx prisma migrate dev --name init

# Reset database and migrations
docker compose down -v
docker compose up -d --build
docker compose exec server npm run prisma:migrate
```

## 📝 Configuration Notes

**Key Changes for Docker:**
- Database URL: `postgres:5432` (not `localhost:5432`)
- Redis Host: `redis` (not `127.0.0.1`)
- Network: All services on `auction_network`
- Volumes: Data persists in Docker volumes

**Accessing Services:**
- From localhost: `http://localhost:5001` (server), `localhost:5432` (postgres), `localhost:6379` (redis)
- From container: `postgres:5432`, `redis:6379` (internal DNS)

## 🚨 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Cannot connect to database" | Check if postgres container is healthy: `docker compose logs postgres` |
| "Port 5001 already in use" | Change in docker-compose: `"5002:5001"` to use port 5002 |
| "npm packages not found" | Rebuild: `docker compose up -d --build --no-cache` |
| "Migrations not running" | Run manually: `docker compose exec server npm run prisma:migrate` |
| "DKIM key not found" | Verify file exists: `ls server/src/config/keys/dkim-private.pem` |

## 📦 File Structure

```
auction-website/
├── server/
│   ├── Dockerfile              ← New: Build script for server
│   ├── .dockerignore           ← New: What to exclude from build
│   ├── docker-compose.yml      ← Updated: Full stack definition
│   ├── .env                    ← Already has config
│   ├── prisma/
│   ├── src/
│   └── package.json
├── DOCKER_SETUP.md             ← New: Full documentation
└── DOCKER_QUICK_START.md       ← This file
```

## 🎯 Expected Behavior

When you run `docker compose up -d --build`:

1. **Builds Node.js image** (30-60 seconds first time)
2. **Pulls PostgreSQL image** (if not cached)
3. **Pulls Redis image** (if not cached)
4. **Creates network** named `auction_network`
5. **Starts PostgreSQL** (waits until healthy)
6. **Starts Redis** (immediately after postgres)
7. **Starts Node.js server** (after postgres health check passes)

Run `docker compose ps` to verify all are **Up (healthy)**

## 💡 Pro Tips

- Mount `src` directory for hot-reload in development:
  ```dockerfile
  volumes:
    - ./src:/app/src
  ```

- Use `.env.example` for team (without secrets):
  ```bash
  git add DOCKER_SETUP.md
  git add server/Dockerfile server/.dockerignore
  git add server/docker-compose.yml
  git add DOCKER_QUICK_START.md
  ```

- For production, consider:
  - Using multi-stage builds (already done ✓)
  - Keeping secrets in `.env` (not committed)
  - Using a container registry (DockerHub, ECR, GCR)
  - Setting up automated deploys (GitHub Actions, GitLab CI)
