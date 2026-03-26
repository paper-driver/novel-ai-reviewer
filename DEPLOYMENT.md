# Deployment Files Overview

This directory contains all files needed to deploy Novel AI Reviewer on Portainer/Raspberry Pi.

## Files Included

### Configuration Files
- **`Dockerfile`** - Build configuration for Docker image
- **`docker-compose.yml`** - Multi-container orchestration (volumes, ports, environment)
- **`.dockerignore`** - Excludes unnecessary files from Docker build context

### Scripts
- **`deploy.sh`** - Bash script for common deployment tasks (executable)

### Documentation
- **`.github/instructions/portainer-raspberry-pi-deployment.md`** - Complete deployment guide

### Environment
- **`.env.example`** - Template for environment variables (copy to `.env` before deployment)

## Quick Start (5 Minutes)

### Option 1: Docker Compose (CLI)
```bash
# 1. Prepare environment
cp .env.example .env
# (edit .env if needed)

# 2. Build and start
docker compose up -d

# 3. Access application
# Open: http://localhost:3000
```

### Option 2: Deploy Script
```bash
# Make script executable
chmod +x deploy.sh

# Quick start
./deploy.sh start

# Check status
./deploy.sh status
```

### Option 3: Portainer UI (Recommended)
```bash
# 1. Setup Portainer
./deploy.sh setup-portainer

# 2. Open http://localhost:9000
# 3. Go to Stacks → Add Stack
# 4. Paste docker-compose.yml contents
# 5. Click Deploy
```

## Common Tasks

### View Logs
```bash
# Option 1: Docker command
docker logs -f novel-ai-reviewer

# Option 2: Deploy script
./deploy.sh logs

# Option 3: Portainer UI
# Containers → novel-ai-reviewer → Logs
```

### Check Status
```bash
./deploy.sh status
```

### Update Application
```bash
./deploy.sh update
```

### Backup Data
```bash
./deploy.sh backup
```

### Restore from Backup
```bash
./deploy.sh restore backups/app_data_20240326_120000.tar.gz
```

## Directory Structure

```
novel-ai-reviewer/
├── Dockerfile                  # Container image definition
├── docker-compose.yml         # Container orchestration
├── .dockerignore              # Build context filter
├── deploy.sh                  # Deployment automation script
├── .env.example               # Environment variables template
├── src/                       # Angular source code
├── server/                    # Express.js server code
├── package.json              # Node.js dependencies
├── data/                      # Application data (persistent volume)
└── .github/
    └── instructions/
        └── portainer-raspberry-pi-deployment.md  # Full guide
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
nano .env  # Edit as needed
```

Key variables:
- `NODE_ENV=production` - Production mode
- `DEPLOYMENT_MODE=desktop` - Desktop version (or 'web')
- `LOG_LEVEL=info` - Logging level (debug, info, warn, error)
- `PORT=3000` - Server port
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Vision API credentials

## Docker Compose Configuration

Default settings are optimized for Raspberry Pi 4B with 4GB RAM:

```yaml
resources:
  limits:
    cpus: '1.5'      # Max CPU cores
    memory: 1024M    # Max memory (1GB)
  reservations:
    cpus: '1'        # Reserved CPU cores
    memory: 512M     # Reserved memory (512MB)
```

Adjust based on your Raspberry Pi specs:

**RPi 4B with 8GB RAM:**
```yaml
limits:
  cpus: '2'
  memory: 2048M
reservations:
  cpus: '1.5'
  memory: 1024M
```

## Port Mappings

- **3000** - Express server (main API)
- **4200** - Angular dev server (optional, remove in production)
- **9000** - Portainer (if using Portainer)

## Persistent Storage

Application data is stored in Docker volume `app_data`:

```bash
# Check volume location
docker volume inspect app_data

# Typical location on Raspberry Pi
/var/lib/docker/volumes/app_data/_data
```

To use external USB SSD:

1. Mount USB SSD: `sudo mount /dev/sda1 /mnt/ssd`
2. Update `docker-compose.yml`:
```yaml
volumes:
  app_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/ssd/app_data
```

## Requirements

### Hardware
- Raspberry Pi 4B+ (minimum 4GB RAM)
- 64GB+ microSD card (Class A2, V90 recommended)
- OR external USB 3.0 SSD

### Software
- Raspberry Pi OS (Bookworm or Bullseye)
- Docker
- Docker Compose

Install:
```bash
# Docker
curl -sSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose (already included in recent Docker installs)
docker compose version
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs novel-ai-reviewer

# Check if port is in use
sudo netstat -tuln | grep 3000
```

### Out of Memory
```bash
# Check memory usage
docker stats novel-ai-reviewer

# Increase Raspberry Pi swap
sudo nano /etc/dphys-swapfile
# Change CONF_SWAPSIZE=2048
sudo systemctl restart dphys-swapfile
```

### Slow Performance
```bash
# Check CPU temperature (should be < 85°C)
vcgencmd measure_temp

# Check disk usage
docker exec novel-ai-reviewer du -sh /app/data
df -h
```

## Security Notes

⚠️ **Important:**
- `.env` file contains sensitive data - never commit to git
- Change Portainer default password
- Don't expose ports 9000 or 3000 to internet without firewall/VPN
- Use HTTPS/reverse proxy for internet access (Nginx, Traefik)
- Keep Raspberry Pi OS updated

## Monitoring

### Manual Monitoring
```bash
# Real-time stats
docker stats novel-ai-reviewer

# Container processes
docker top novel-ai-reviewer

# Network usage
docker exec novel-ai-reviewer ss -an
```

### Via Portainer
Portainer → Dashboard → Shows resource usage, container status, etc.

## Updating

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
./deploy.sh update

# Or manually
docker compose up -d --pull always --force-recreate
```

## Backup Strategy

Create regular backups:

```bash
# Backup
./deploy.sh backup

# Restore
./deploy.sh restore backups/app_data_20240326_120000.tar.gz

# Automate with cron
0 2 * * * /home/pi/novel-ai-reviewer/deploy.sh backup
```

## Advanced Configuration

### Using Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name reviewer.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Using HTTPS with Let's Encrypt
See full deployment guide for Traefik/Nginx setup

### Using External Database
Modify docker-compose.yml to add database service (PostgreSQL, MongoDB, etc.)

## Support

- **Documentation:** `.github/instructions/portainer-raspberry-pi-deployment.md`
- **Issues:** Report in GitHub issues
- **Docker Docs:** https://docs.docker.com
- **Portainer Docs:** https://docs.portainer.io

## License

See LICENSE file in project root.
