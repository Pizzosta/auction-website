# Docker Setup Verification Checklist

## Pre-Flight Checks ✈️

Before running Docker, verify your setup:

### System Requirements

- [ ] Docker Desktop installed: `docker --version` returns v20+
- [ ] Docker running: Docker icon visible in system tray/menu bar
- [ ] Docker compose available: `docker compose --version` returns v2.0+
- [ ] Ports 5001, 5432, 6379 are available or remapped

### Project Structure

- [ ] File exists: `server/Dockerfile`
- [ ] File exists: `server/.dockerignore`
- [ ] File updated: `server/docker-compose.yml`
- [ ] File exists: `server/.env` with all required variables
- [ ] Directory exists: `server/src/config/keys/` (for DKIM)

### Environment Setup

```bash
cd server

# Check all required env vars are set
echo "DATABASE_URL: $DATABASE_URL"
echo "JWT_SECRET: $JWT_SECRET"
echo "REDIS_HOST: $REDIS_HOST"

# They should NOT be empty
```

---

## Step 1: Build & Start ✅

```bash
# Navigate to server directory
cd /Users/pizzosta/Desktop/CODING/auction-website/server

# Build images and start all services
docker compose up -d --build
```

**Expected Output:**

```
Creating auction_postgres ... done
Creating auction_redis ... done
Creating auction_server ... done
```

**Verify this step:**

```bash
docker compose ps
```

**Expected Result:**

| NAME             | STATUS       | PORTS                  |
| ---------------- | ------------ | ---------------------- |
| auction_postgres | Up (healthy) | 0.0.0.0:5432->5432/tcp |
| auction_redis    | Up (healthy) | 0.0.0.0:6379->6379/tcp |
| auction_server   | Up (healthy) | 0.0.0.0:5001->5001/tcp |

- [ ] All services show "Up (healthy)"
- [ ] No services show "Exited" or "Restarting"

---

## Step 2: Check Service Logs 📋

### PostgreSQL

```bash
docker compose logs postgres
```

- [ ] No ERROR messages
- [ ] Contains "listening on TCP/IP port 5432"
- [ ] Contains "database system is ready to accept connections"

### Redis

```bash
docker compose logs redis
```

- [ ] No ERROR messages
- [ ] Contains "Ready to accept connections"

### Node.js Server

```bash
docker compose logs server
```

- [ ] No ERROR messages
- [ ] Contains "Server running on port 5001" or similar
- [ ] No "Cannot connect to database" errors
- [ ] No "Cannot connect to redis" errors

---

## Step 3: Test Database Connection ✔️

### From Container

```bash
docker compose exec postgres psql -U pizzosta -d auction_website -c "SELECT version();"
```

- [ ] Returns PostgreSQL version info

### From Your Machine

```bash
psql -h localhost -U pizzosta -d auction_website -c "SELECT 1;"
```

- [ ] Returns "1" (single row)
- [ ] If psql not installed: `brew install postgresql`

---

## Step 4: Test Redis Connection 🔴

```bash
docker compose exec redis redis-cli ping
```

- [ ] Returns "PONG"

---

## Step 5: Test Server API 🌐

```bash
curl http://localhost:5001
```

- [ ] Returns some response (not "Connection refused")
- [ ] Should show API response or swagger docs

```bash
curl http://localhost:5001/api-docs
```

- [ ] Returns Swagger UI HTML (if configured)

---

## Step 6: Run Database Migrations 🔄

```bash
docker compose exec server npm run prisma:migrate
```

**Expected Output:**

```
✔ Prisma Migrate applied migrations...
```

- [ ] No ERROR messages
- [ ] Completes successfully

**Verify migrations:**

```bash
docker compose exec postgres psql -U pizzosta -d auction_website -c "\dt"
```

- [ ] Shows tables: User, Auction, Bid, etc.
- [ ] Not empty (has tables)

---

## Step 7: Create Admin User (Optional) 👤

```bash
docker compose exec server npm run create-users
```

**Expected Output:**

```
Admin user created successfully
Password: xxxxxxxxxxxx
```

- [ ] User created successfully
- [ ] Password displayed

---

## Step 8: Verify Data Persistence 💾

### Stop and Restart (data should remain)

```bash
# Stop containers
docker compose stop

# Start them again
docker compose start

# Check if data is still there
docker compose exec postgres psql -U pizzosta -d auction_website -c "SELECT COUNT(*) FROM \"User\";"
```

- [ ] Returns count > 0 (if you created users)

### Fresh Start (data cleared)

```bash
# Remove everything including volumes
docker compose down -v

# Start fresh
docker compose up -d --build

# Verify database is empty
docker compose exec postgres psql -U pizzosta -d auction_website -c "SELECT COUNT(*) FROM \"User\";"
```

- [ ] Returns error (tables don't exist yet)

---

## Step 9: Verify Network Communication 🔗

```bash
# From server container, can it reach postgres?
docker compose exec server ping -c 3 postgres
```

- [ ] Returns "3 packets transmitted, 3 received"

```bash
# From server container, can it reach redis?
docker compose exec server redis-cli -h redis ping
```

- [ ] Returns "PONG"

---

## Step 10: Check Environment Variables 🔧

```bash
# Verify server has correct env vars
docker compose exec server env | grep DATABASE
```

- [ ] Shows: `DATABASE_URL=postgresql://pizzosta:pizzosta@postgres:5432/auction_website?schema=public`
- [ ] NOT localhost - must be postgres (service name)

```bash
docker compose exec server env | grep REDIS
```

- [ ] Shows: `REDIS_HOST=redis`
- [ ] NOT 127.0.0.1

---

## Step 11: File System Verification 📁

```bash
# Check if source code is mounted correctly
docker compose exec server ls -la /app/src | head -10
```

- [ ] Shows: server.js, controllers, routes, etc.

```bash
# Check if Prisma client was generated
docker compose exec server ls -la /app/node_modules/.prisma/client | head -5
```

- [ ] Shows: index.js, index-browser.js, package.json

---

## Step 12: Performance Check ⚡

```bash
# Check container resource usage
docker stats --no-stream
```

Expected ranges:

- **auction_server**: CPU < 5%, Memory 100-300MB
- **auction_postgres**: CPU 0%, Memory 50-100MB
- **auction_redis**: CPU 0%, Memory 10-30MB

- [ ] CPU usage reasonable (not stuck at 100%)
- [ ] Memory usage reasonable (not growing unbounded)

---

## Common Issues & Quick Fixes 🐛

### Issue: "Port 5001 already in use"

```bash
# Find what's using it
lsof -i :5001

# Solution: Change docker-compose.yml
# "5002:5001" instead of "5001:5001"

# Then rebuild
docker compose up -d --build
```

### Issue: "Cannot connect to database"

```bash
# Check postgres is healthy
docker compose logs postgres

# Make sure DATABASE_URL uses 'postgres' not 'localhost'
docker compose exec server env | grep DATABASE_URL

# Restart postgres
docker compose restart postgres

# Wait 5 seconds and check again
sleep 5 && docker compose logs postgres
```

### Issue: "node_modules not found"

```bash
# Rebuild without cache
docker compose up -d --build --no-cache

# This re-runs npm ci and installs everything fresh
```

### Issue: "DKIM key not found"

```bash
# Check file exists locally
ls server/src/config/keys/dkim-private.pem

# If not, copy it or create a dummy one
touch server/src/config/keys/dkim-private.pem

# Rebuild
docker compose up -d --build
```

### Issue: "Migration fails"

```bash
# Drop and recreate database
docker compose exec postgres dropdb -U pizzosta auction_website
docker compose exec postgres createdb -U pizzosta auction_website

# Re-run migrations
docker compose exec server npm run prisma:migrate
```

---

## Success Criteria ✨

You should be able to:

- [ ] `docker compose ps` shows all services as "Up (healthy)"
- [ ] `curl http://localhost:5001` returns a response
- [ ] `psql -h localhost -U pizzosta -d auction_website` connects successfully
- [ ] `docker compose exec redis redis-cli ping` returns "PONG"
- [ ] Database tables exist after migrations
- [ ] Server logs show no ERROR messages
- [ ] Can create/read/update/delete records via API
- [ ] Data persists after container restart

---

## Next Steps 🚀

Once all checks pass:

1. **Local Development**

   - Mount `src` directory for hot-reload
   - Use `npm run dev` instead of `npm start`
2. **Testing**

   ```bash
   docker compose exec server npm test
   ```
3. **Linting**

   ```bash
   docker compose exec server npm run lint
   ```
4. **Production Ready**

   - Move secrets to environment variables or secrets manager
   - Use `NODE_ENV=production`
   - Consider using a container registry

---

## Reference Commands

```bash
# Lifecycle
docker compose up -d --build         # Start everything
docker compose stop                  # Stop all (keep data)
docker compose down                  # Stop and remove containers
docker compose down -v               # Stop and remove everything (fresh)

# Debugging
docker compose logs -f               # View all logs
docker compose logs -f server        # View server logs
docker compose ps                    # See container status
docker compose exec server /bin/sh   # Shell into server

# Database
docker compose exec postgres psql -U pizzosta -d auction_website

# Testing Connectivity
curl http://localhost:5001
docker compose exec server npm test
docker compose exec server npm run lint
```

---

**Documentation:** See `DOCKER_SETUP.md`, `DOCKER_QUICK_START.md`, `DOCKER_ARCHITECTURE.md`
