# Novel AI Reviewer - Portainer Raspberry Pi Deployment Guide

## Overview
This guide provides step-by-step instructions to deploy the Novel AI Reviewer application on a Raspberry Pi using Docker and Portainer.

**Architecture:**
- **Frontend:** Angular app (served by Express)
- **Backend:** Express.js server
- **Database:** File-based JSON storage
- **Vision API:** Google Cloud Vision (optional, can be disabled)
- **Storage:** Persistent volume for user data

## Prerequisites

### Hardware Requirements
- Raspberry Pi 4B or higher (4GB RAM minimum, 8GB recommended)
- Micro SD Card 64GB+ (Class A2, V90 recommended)
- Power supply (5V/3A minimum for RPi 4)
- Network connection (Ethernet or WiFi)

### Software Requirements
- Raspberry Pi OS (Bookworm or Bullseye)
- Docker and Docker Compose installed
- Portainer CE (Community Edition)
- Node.js 22.x or compatible

## Setup Steps

### Step 1: Prepare Raspberry Pi

#### 1.1 Update System
```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y curl git
```

#### 1.2 Install Docker
```bash
# Official Docker installation for Raspberry Pi
curl -sSL https://get.docker.com | sh

# Add pi user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
```

#### 1.3 Install Docker Compose
```bash
sudo apt-get install -y docker-compose-plugin

# Verify installation
docker compose version
```

#### 1.4 Increase Swap Space (Recommended for large builds)
```bash
# Edit dphys-swapfile
sudo nano /etc/dphys-swapfile

# Change CONF_SWAPSIZE to 2048 or higher
CONF_SWAPSIZE=2048

# Save and restart swap
sudo systemctl restart dphys-swapfile
```

### Step 2: Install and Configure Portainer

#### 2.1 Create Portainer Volume
```bash
docker volume create portainer_data
```

#### 2.2 Run Portainer Container
```bash
docker run -d \
  -p 8000:8000 \
  -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  --name portainer \
  --restart always \
  portainer/portainer-ce:latest
```

#### 2.3 Access Portainer
- Open browser to: `http://raspberry-pi-ip:9000`
- Create admin account
- Choose "Local" as the environment

### Step 3: Build Docker Image

#### 3.1 Create Dockerfile
Create `Dockerfile` in project root:

```dockerfile
FROM node:22-bookworm

WORKDIR /app

# Install Angular CLI and build tools
RUN npm install -g @angular/cli typescript

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Copy Google Cloud credentials (if using Vision API)
# COPY google-vision-credentials.json ./

# Build Angular app
RUN npm run build

# Expose ports
EXPOSE 3000 4200

# Start server
CMD ["node", "server.modular.js"]
```

#### 3.2 Create .dockerignore
```
node_modules
dist
.git
.gitignore
README.md
.angular
.vscode
angular.json
tsconfig*.json
karma.conf.js
*.md
.env
.env.local
data/generated
```

#### 3.3 Create docker-compose.yml
Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  novel-ai-reviewer:
    image: novel-ai-reviewer:latest
    container_name: novel-ai-reviewer
    restart: unless-stopped
    
    # Port mappings
    ports:
      - "3000:3000"
      - "4200:4200"  # Remove in production
    
    # Volume mounts for persistent data
    volumes:
      - app_data:/app/data
      - ./google-vision-credentials.json:/app/google-vision-credentials.json:ro
    
    # Environment variables
    environment:
      - NODE_ENV=production
      - GOOGLE_APPLICATION_CREDENTIALS=/app/google-vision-credentials.json
      - LOG_LEVEL=info
    
    # Resource limits (adjust based on RPi specs)
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 1024M
        reservations:
          cpus: '1'
          memory: 512M
    
    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
    # Logging
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  app_data:
    driver: local
```

### Step 4: Prepare Credentials and Configuration

#### 4.1 Google Cloud Vision Credentials (Optional)
If using Vision API features:
```bash
# Copy credentials from your machine
scp google-vision-credentials.json pi@raspberry-pi-ip:/home/pi/novel-ai-reviewer/

# Or create empty placeholder
echo "{}" > google-vision-credentials.json
```

#### 4.2 Create data directory structure
```bash
mkdir -p data/
```

### Step 5: Deploy via Portainer

#### 5.1 Clone Repository to Raspberry Pi
```bash
cd ~/
git clone https://github.com/your-user/novel-ai-reviewer.git
cd novel-ai-reviewer
```

#### 5.2 Build Docker Image on Raspberry Pi
```bash
# Option 1: Build locally on RPi (slow, takes 10-20 minutes)
docker build -t novel-ai-reviewer:latest .

# Option 2: Use pre-built image (recommended)
# See "Option B: Use Pre-built Image" below
```

#### 5.3 Deploy via Portainer UI
1. Go to Portainer (http://raspberry-pi-ip:9000)
2. Navigate to "Containers"
3. Click "Add Container"
4. Or use "Stacks" to deploy docker-compose.yml:
   - Go to "Stacks"
   - Click "Add Stack"
   - Paste contents of `docker-compose.yml`
   - Click "Deploy"

#### 5.4 Or Deploy via Docker Compose CLI
```bash
docker compose up -d
```

### Step 6: Configuration and Optimization

#### 6.1 Environment Variables
Edit `docker-compose.yml` to configure:

```yaml
environment:
  NODE_ENV: production          # Use 'production' for RPi
  DEPLOYMENT_MODE: desktop      # Or 'web' for web-only features
  LOG_LEVEL: info              # debug, info, warn, error
  PORT: 3000                   # Server port
  CORS_ORIGIN: "*"             # Restrict if needed
```

#### 6.2 Resource Limits
For Raspberry Pi 4B with 4GB RAM:
```yaml
deploy:
  resources:
    limits:
      cpus: '1.5'
      memory: 1024M
    reservations:
      cpus: '1'
      memory: 512M
```

For Raspberry Pi 4B with 8GB RAM:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2048M
    reservations:
      cpus: '1.5'
      memory: 1024M
```

#### 6.3 Enable Persistent Storage
```bash
# Check volume
docker volume ls

# Inspect volume location
docker volume inspect app_data

# Location typically: /var/lib/docker/volumes/app_data/_data
```

### Step 7: Post-Deployment

#### 7.1 Access Application
- **Application UI:** http://raspberry-pi-ip:3000
- **Portainer Console:** http://raspberry-pi-ip:9000

#### 7.2 Check Container Logs
```bash
# Via CLI
docker logs -f novel-ai-reviewer

# Via Portainer UI
# Containers → novel-ai-reviewer → Logs
```

#### 7.3 Verify Health
```bash
# Check container status
docker ps | grep novel-ai-reviewer

# Test API
curl http://localhost:3000/api/health

# Check data directory
docker exec novel-ai-reviewer ls -la /app/data
```

## Advanced Configuration

### Enable HTTPS

#### Option 1: Reverse Proxy with Traefik
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.nar.rule=Host(`reviewer.example.com`)"
  - "traefik.http.routers.nar.entrypoints=websecure"
  - "traefik.http.routers.nar.tls.certresolver=letsencrypt"
```

#### Option 2: Nginx Reverse Proxy
```nginx
upstream api {
  server novel-ai-reviewer:3000;
}

server {
  listen 443 ssl http2;
  server_name reviewer.example.com;
  
  ssl_certificate /etc/letsencrypt/live/reviewer.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/reviewer.example.com/privkey.pem;
  
  location / {
    proxy_pass http://api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### Backup Strategy

#### 7.1 Backup Data Volume
```bash
# Create backup
docker run --rm \
  -v app_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/app_data_backup.tar.gz -C /data .

# Restore backup
docker run --rm \
  -v app_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/app_data_backup.tar.gz -C /data
```

#### 7.2 Automated Backups
Create `backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/home/pi/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

docker run --rm \
  -v app_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/app_data_$DATE.tar.gz -C /data .

# Keep only last 7 backups
find $BACKUP_DIR -name "app_data_*.tar.gz" -mtime +7 -delete
```

Schedule with cron:
```bash
# Add to crontab (crontab -e)
0 2 * * * /home/pi/novel-ai-reviewer/backup.sh
```

### Monitoring

#### 7.3 View Container Stats
```bash
# Real-time stats
docker stats novel-ai-reviewer

# Via Portainer: Dashboard → Containers
```

#### 7.4 Check Disk Usage
```bash
# Container size
docker exec novel-ai-reviewer du -sh /app/data

# Raspberry Pi disk usage
df -h
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs novel-ai-reviewer

# Check if port is in use
sudo netstat -tuln | grep :3000

# Restart container
docker restart novel-ai-reviewer
```

### Out of Memory Errors

**Symptoms:** Container crashes or becomes unresponsive

**Solutions:**
1. Increase swap space (see Step 1.4)
2. Reduce resource limits in docker-compose.yml
3. Reduce number of concurrent users
4. Enable cleanup of old data

```bash
# View memory usage
docker stats novel-ai-reviewer

# Increase memory limit
# Edit docker-compose.yml and redeploy
docker compose up -d --force-recreate
```

### Slow Performance

**Solutions:**
1. Check Raspberry Pi temperature: `vcgencmd measure_temp`
2. Use USB SSD instead of SD card for data
3. Disable optional features (Vision API if not needed)
4. Reduce concurrent requests
5. Enable caching

### Data Persistence Issues

```bash
# Verify volume mounted correctly
docker inspect novel-ai-reviewer | grep -A 20 "Mounts"

# Check volume content
docker exec novel-ai-reviewer ls -la /app/data

# Manually create missing files
docker exec novel-ai-reviewer mkdir -p /app/data
```

### Network Connection Issues

```bash
# Test connectivity
docker exec novel-ai-reviewer curl -I http://localhost:3000

# Check DNS
docker exec novel-ai-reviewer nslookup google.com

# Ping Raspberry Pi from other machine
ping raspberry-pi-ip
```

## Performance Optimization

### 1. Use External USB SSD for Data
```bash
# Mount USB SSD
sudo mount /dev/sda1 /mnt/ssd

# Update docker-compose.yml volume
volumes:
  app_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/ssd/app_data
```

### 2. Enable CPU Frequency Governor
```bash
# Check current frequency
watch -n 1 "vcgencmd measure_clock arm"

# Set performance governor
echo "performance" | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
```

### 3. Reduce Logging Level in Production
```yaml
environment:
  - LOG_LEVEL=warn  # Instead of 'info' or 'debug'
```

### 4. Prune Old Docker Data
```bash
# Remove unused images, containers, and volumes
docker system prune -a --volumes
```

## Updating the Application

### 1. Pull Latest Changes
```bash
cd ~/novel-ai-reviewer
git pull origin main
```

### 2. Rebuild and Redeploy
```bash
# Option 1: Full rebuild
docker compose down
docker build --no-cache -t novel-ai-reviewer:latest .
docker compose up -d

# Option 2: Quick update (reuse cached layers)
docker build -t novel-ai-reviewer:latest .
docker compose up -d --force-recreate
```

### 3. Verify Update
```bash
docker logs -f novel-ai-reviewer
# Check for any errors in logs

curl http://localhost:3000/api/health
```

## Security Best Practices

### 1. Restrict Portainer Access
- Change default password
- Do NOT expose port 9000 to internet
- Use firewall rules

### 2. Set Environment Variables Securely
```bash
# Create .env file (never commit to git)
NODE_ENV=production
DEPLOYMENT_MODE=desktop

# Load from file in docker-compose.yml
env_file:
  - .env
```

### 3. Use Non-Root User (Optional)
```dockerfile
RUN useradd -m -u 1000 appuser
USER appuser
```

### 4. Regular Backups
Implement automated backups (see backup strategy above)

### 5. Monitor Logs
```bash
# Tail logs
docker logs -f novel-ai-reviewer

# Or use docker event viewer
docker events --filter 'container=novel-ai-reviewer'
```

## Maintenance Checklist

- [ ] Weekly: Check disk space (`df -h`)
- [ ] Weekly: Review container logs for errors
- [ ] Monthly: Update Docker images
- [ ] Monthly: Test backup restoration
- [ ] Monthly: Update Raspberry Pi OS (`sudo apt update && sudo apt upgrade`)
- [ ] Quarterly: Clean up old data in /app/data
- [ ] Quarterly: Review resource usage

## Reference

### Useful Commands

```bash
# Container management
docker compose ps                    # List running containers
docker compose logs -f              # Stream logs
docker compose restart              # Restart without rebuilding
docker compose stop                 # Stop without removing
docker compose rm                   # Remove containers
docker compose down                 # Stop and remove

# Image management
docker images                       # List images
docker rmi image-name              # Remove image
docker tag old-name:tag new-name:tag  # Tag image
docker push new-name:tag           # Push to registry

# Volume management
docker volume ls                    # List volumes
docker volume inspect app_data      # Details about volume
docker volume rm app_data          # Remove volume

# System information
docker system df                    # Disk usage
docker stats                        # Real-time stats
docker info                         # Docker system info
uname -a                           # Raspberry Pi info
vcgencmd measure_temp              # CPU temperature
```

### Portainer Features

- **Containers:** Deploy, monitor, manage containers
- **Images:** View, pull, build, push images
- **Volumes:** Manage persistent storage
- **Networks:** Configure container networking
- **Stacks:** Deploy multi-container applications
- **App Templates:** Pre-built application templates
- **Registries:** Connect to Docker registries

## Support Resources

- **Project Repo:** https://github.com/your-user/novel-ai-reviewer
- **Portainer Docs:** https://docs.portainer.io
- **Docker Docs:** https://docs.docker.com
- **Raspberry Pi Docs:** https://www.raspberrypi.com/documentation
- **Node.js:** https://nodejs.org

## Changelog

### Version 1.0 (Initial Release)
- Basic Portainer/RPi deployment guide
- Docker Compose configuration
- Security and backup strategies
- Troubleshooting guide
- Performance optimization tips
