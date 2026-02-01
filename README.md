# KnowHow

A self-hosted Stack Overflow for Teams clone. Run your own private Q&A platform.

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/yourorg/knowhow.git
cd knowhow
cp .env.example .env

# 2. Generate secrets (see below) and edit .env

# 3. Start the application
docker compose up -d

# 4. Access at http://localhost:3000
```

## Configuration

Copy `.env.example` to `.env` and configure the following variables:

| Variable              | Description                              | Required |
| --------------------- | ---------------------------------------- | -------- |
| `DB_USER`             | MySQL database user                      | Yes      |
| `DB_PASSWORD`         | MySQL database password                  | Yes      |
| `DB_NAME`             | Database name (default: `knowhow`)       | No       |
| `MYSQL_ROOT_PASSWORD` | MySQL root password                      | Yes      |
| `JWT_SECRET`          | Secret for signing JWT tokens            | Yes      |
| `SESSION_SECRET`      | Secret for session encryption            | Yes      |
| `APP_PORT`            | Port to expose the app (default: `3000`) | No       |

## Generating Secrets

**You must generate unique values for `JWT_SECRET` and `SESSION_SECRET`.** Do not use the example values in production.

### Option 1: OpenSSL (Linux/macOS)

```bash
# Generate a 64-character random string
openssl rand -base64 48
```

### Option 2: Node.js

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### Option 3: Python

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Option 4: Online Generator

Use a password generator set to 64+ characters with letters, numbers, and symbols.

### Example .env secrets section

```env
# Generate unique values - DO NOT use these examples!
JWT_SECRET=your-generated-64-char-secret-here-abc123xyz
SESSION_SECRET=another-unique-64-char-secret-here-def456
```

## Database Passwords

For `DB_PASSWORD` and `MYSQL_ROOT_PASSWORD`, generate strong passwords using the same methods above, or use a password manager.

## Backup & Restore

KnowHow uses MySQL. The `mysqldump` command exports the database to a plain-text SQL file containing all the `CREATE TABLE` and `INSERT` statements needed to recreate your data.

### Creating a Backup

```bash
# Basic backup (will prompt for password)
docker exec knowhow-mysql mysqldump -u root -p knowhow > backup.sql

# Backup with password from environment (for scripts)
docker exec knowhow-mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" knowhow > backup.sql

# Backup with timestamp
docker exec knowhow-mysql mysqldump -u root -p knowhow > "backup-$(date +%Y%m%d-%H%M%S).sql"
```

The output is a `.sql` text file that you can open in any editor. It contains statements like:

```sql
CREATE TABLE `users` (...);
INSERT INTO `users` VALUES (1, 'user@example.com', ...);
```

### Restoring from Backup

```bash
# Restore (will prompt for password)
docker exec -i knowhow-mysql mysql -u root -p knowhow < backup.sql
```

This runs all the SQL statements in the backup file against the database, recreating tables and data.

### Automated Backups

For production, consider setting up a cron job:

```bash
# Example: daily backup at 2 AM, keep last 7 days
0 2 * * * docker exec knowhow-mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" knowhow > /backups/knowhow-$(date +\%Y\%m\%d).sql && find /backups -name "knowhow-*.sql" -mtime +7 -delete
```

## Upgrading

### Standard Upgrade

```bash
# 1. Create a backup first (always!)
docker exec knowhow-mysql mysqldump -u root -p knowhow > backup-before-upgrade.sql

# 2. Pull the latest version
docker compose pull

# 3. Restart with new version
docker compose down
docker compose up -d

# 4. Verify the application is running
docker compose ps
docker compose logs -f app
```

### Upgrading from Git Source

If you cloned the repository instead of using a pre-built image:

```bash
# 1. Backup
docker exec knowhow-mysql mysqldump -u root -p knowhow > backup-before-upgrade.sql

# 2. Pull latest code
git fetch origin
git pull origin main

# 3. Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Rollback

If something goes wrong after upgrading:

```bash
# 1. Stop the application
docker compose down

# 2. Restore previous image (if using pre-built images)
docker compose pull yourorg/knowhow:v1.0.0  # specify previous version tag

# 3. Or revert code (if using git)
git checkout v1.0.0  # or previous commit

# 4. Restore database backup
docker compose up -d db
docker exec -i knowhow-mysql mysql -u root -p knowhow < backup-before-upgrade.sql

# 5. Start application
docker compose up -d
```

### Version Pinning

For production stability, pin to a specific version instead of `latest`:

```yaml
# In docker-compose.yml
services:
  app:
    image: yourorg/knowhow:v1.2.0 # Pin to specific version
```

## Health Check

KnowHow exposes a `/health` endpoint for container orchestration and load balancers.

```bash
curl http://localhost:3000/health
```

**Healthy response** (HTTP 200):
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "database": "connected"
}
```

**Unhealthy response** (HTTP 503):
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "database": "disconnected"
}
```

### Docker Compose Health Check

Add to your `docker-compose.yml`:

```yaml
services:
  app:
    # ... other config
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```
