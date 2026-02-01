# KnowHow Release Plan

Steps to prepare KnowHow for public release as a self-hosted Docker application.

## Current State

- Development `docker-compose.yml` exists but uses hardcoded credentials
- No production Dockerfile (only `.devcontainer/Dockerfile` for development)
- Environment variables partially configured via `.env.example`
- Database initialization handled by `config/init-db.js`

---

## Phase 1: Production Docker Setup

### 1.1 Create Production Dockerfile

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Remove dev files
RUN rm -rf .devcontainer .git spec

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]
```

### 1.2 Create Production docker-compose.yml

Create `docker-compose.prod.yml`:

```yaml
version: "3.8"

services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME:-knowhow}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - knowhow-network

  app:
    build: .
    restart: unless-stopped
    ports:
      - "${APP_PORT:-3000}:3000"
    environment:
      DB_HOST: db
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME:-knowhow}
      DB_PORT: 3306
      PORT: 3000
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - knowhow-network

volumes:
  mysql_data:

networks:
  knowhow-network:
    driver: bridge
```

### 1.3 Update .env.example

```env
# Database Configuration
DB_USER=knowhow
DB_PASSWORD=change_this_secure_password
DB_NAME=knowhow
MYSQL_ROOT_PASSWORD=change_this_root_password

# Server Configuration
APP_PORT=3000
NODE_ENV=production

# Security (REQUIRED - generate unique values)
JWT_SECRET=generate-a-64-char-random-string-here
SESSION_SECRET=generate-another-64-char-random-string-here
```

---

## Phase 2: Security Hardening

### 2.1 Remove Hardcoded Secrets

- [x] `.env.example` already excludes secrets
- [x] Remove hardcoded credentials from `docker-compose.yml` (development file)
- [x] Add secret generation instructions to documentation

### 2.2 Security Headers

Add security middleware to `server.js`:

- Helmet.js for HTTP security headers
- Rate limiting for API endpoints
- CORS configuration for production

### 2.3 Cookie Security

Ensure production cookie settings:

- `secure: true` when behind HTTPS
- `sameSite: 'strict'`
- `httpOnly: true` (already implemented)

---

## Phase 3: Database Management

### 3.1 Database Migrations

Current approach uses `CREATE TABLE IF NOT EXISTS` which works for initial setup but doesn't handle schema changes.

Options:

1. **Simple**: Keep current approach, document breaking changes
2. **Recommended**: Add migration system (e.g., `node-pg-migrate` pattern)

### 3.2 Backup Strategy

Document backup procedures:

```bash
# Backup
docker exec knowhow-mysql mysqldump -u root -p knowhow > backup.sql

# Restore
docker exec -i knowhow-mysql mysql -u root -p knowhow < backup.sql
```

---

## Phase 4: Documentation

### 4.1 Create README.md Sections

- **Quick Start**: Minimal steps to get running
- **Configuration**: All environment variables explained
- **Production Deployment**: Full guide with security considerations
- **Reverse Proxy**: nginx/Traefik examples for SSL termination
- **Backup/Restore**: Database backup procedures
- **Upgrading**: Version upgrade instructions

### 4.2 Quick Start Example

```bash
# 1. Clone the repository
git clone https://github.com/yourorg/knowhow.git
cd knowhow

# 2. Configure environment
cp .env.example .env
# Edit .env with your values (especially secrets!)

# 3. Start the application
docker compose -f docker-compose.prod.yml up -d

# 4. Access at http://localhost:3000
```

### 4.3 Reverse Proxy Configuration

Example nginx configuration for SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name knowhow.example.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Phase 5: Release Artifacts

### 5.1 Docker Hub / GitHub Container Registry

1. Set up automated builds via GitHub Actions
2. Tag images with semantic versions (e.g., `v1.0.0`, `v1.0`, `v1`, `latest`)
3. Multi-arch builds (amd64, arm64) for broader compatibility

### 5.2 GitHub Actions Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.ref_name }}
            ghcr.io/${{ github.repository }}:latest
```

### 5.3 Version Tagging

Follow semantic versioning:

- `MAJOR.MINOR.PATCH` (e.g., 1.0.0)
- Breaking changes increment MAJOR
- New features increment MINOR
- Bug fixes increment PATCH

---

## Phase 6: Health & Monitoring

### 6.1 Health Check Endpoint

Add `/health` endpoint to `server.js`:

```javascript
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", database: "connected" });
  } catch (error) {
    res.status(503).json({ status: "unhealthy", database: "disconnected" });
  }
});
```

### 6.2 Docker Health Check

Add to Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

---

## Phase 7: Pre-Release Checklist

### Code Quality

- [ ] Remove all `console.log` debug statements (keep error logging)
- [ ] Ensure no sensitive data in error messages
- [ ] Test all features work in production mode

### Security

- [ ] All secrets via environment variables (no hardcoded values)
- [ ] Password hashing uses bcrypt with appropriate cost factor
- [ ] JWT secrets are sufficiently long and random
- [ ] SQL injection protection via parameterized queries
- [ ] XSS protection via DOMPurify

### Documentation

- [x] README with quick start guide
- [x] All environment variables documented
- [x] Backup/restore procedures documented
- [x] Upgrade path documented

### Docker

- [ ] Production Dockerfile created and tested
- [ ] docker-compose.prod.yml tested
- [ ] Multi-architecture builds working
- [ ] Images pushed to registry

### Testing

- [ ] Fresh install works (no existing data)
- [ ] Upgrade from previous version works (if applicable)
- [ ] Database initialization runs correctly
- [ ] All API endpoints functional

---

## Implementation Order

4. **Short-term**: Write user-facing documentation
5. **Later**: Consider database migration system

---

## Files to Create/Modify

| File                            | Action                      | Priority |
| ------------------------------- | --------------------------- | -------- |
| `Dockerfile`                    | Create                      | High     |
| `docker-compose.prod.yml`       | Create                      | High     |
| `.env.example`                  | Update                      | High     |
| `README.md`                     | Update with deployment docs | High     |
| `.dockerignore`                 | Create                      | Medium   |
| `.github/workflows/release.yml` | Create                      | Medium   |
| `server.js`                     | Add /health endpoint        | Medium   |
