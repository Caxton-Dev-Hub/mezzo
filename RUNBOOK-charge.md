# Mezzo Charge Deployment Runbook

This runbook covers deploying the Mezzo Charge powerbank rental system to production on Hetzner.

## Prerequisites

- Hetzner server with Docker and Docker Compose installed
- Cloudflare account with DNS management for mezzoescrow.xyz
- Database migrations applied (FEAT-001 through FEAT-004)
- API service running and healthy

## DNS Configuration

### Cloudflare Setup

1. Log in to Cloudflare dashboard
2. Navigate to DNS settings for mezzoescrow.xyz
3. Add an A record:
   - **Type**: A
   - **Name**: charge
   - **IPv4 address**: Your Hetzner server IP
   - **TTL**: Auto
   - **Proxy status**: Proxied (orange cloud enabled)

This will route `charge.mezzoescrow.xyz` through Cloudflare's proxy with automatic HTTPS/TLS.

## Reverse Proxy Configuration

### Option 1: Caddy (Recommended)

Create or update `/etc/caddy/Caddyfile`:

```caddy
charge.mezzoescrow.xyz {
    reverse_proxy localhost:3002
    encode gzip
    log {
        output file /var/log/caddy/charge.log
    }
}
```

Reload Caddy:
```bash
sudo systemctl reload caddy
```

### Option 2: Nginx

Create `/etc/nginx/sites-available/charge.mezzoescrow.xyz`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name charge.mezzoescrow.xyz;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and obtain TLS certificate:
```bash
sudo ln -s /etc/nginx/sites-available/charge.mezzoescrow.xyz /etc/nginx/sites-enabled/
sudo certbot --nginx -d charge.mezzoescrow.xyz
sudo systemctl reload nginx
```

## Environment Variables

Ensure the following are set in your production `.env` file:

```bash
# API Configuration (existing)
CORS_ORIGINS=https://mezzoescrow.xyz,https://charge.mezzoescrow.xyz

# Next.js Build Args
NEXT_PUBLIC_API_URL=https://api.mezzoescrow.xyz
NEXT_PUBLIC_MAX_UPLOAD_MB=10

# S3/MinIO for verification photos (existing)
S3_BUCKET=mezzo-evidence
S3_PUBLIC_ENDPOINT=https://minio.mezzoescrow.xyz
```

## Build and Deploy

### Build Docker Image

```bash
cd /path/to/mezzo
docker compose -f docker-compose.prod.yml build charge
```

### Start Service

```bash
docker compose -f docker-compose.prod.yml up -d charge
```

### Verify Health

```bash
docker compose -f docker-compose.prod.yml ps charge
docker compose -f docker-compose.prod.yml logs -f charge
curl -I https://charge.mezzoescrow.xyz
```

Expected: HTTP 200 OK

## First-Run Setup

### 1. Verify Database Schema

Ensure migrations from FEAT-001 through FEAT-004 are applied:

```bash
docker compose -f docker-compose.prod.yml exec api pnpm migration:run
```

### 2. Create Admin User (if not exists)

Set `BOOTSTRAP_ADMIN_EMAILS` in `.env` before first API start, or create manually:

```bash
docker compose -f docker-compose.prod.yml exec api pnpm seed:admin
```

### 3. Seed Initial Shops

Log in to the Charge admin panel at `https://charge.mezzoescrow.xyz/admin` and create your first shop, or seed via API:

```bash
curl -X POST https://api.mezzoescrow.xyz/shops \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Shop 1",
    "location": "123 Main Street, Lagos"
  }'
```

### 4. Create Powerbanks

Powerbanks are created via the admin API. Example:

```bash
curl -X POST https://api.mezzoescrow.xyz/powerbanks \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "PB001",
    "shopId": "SHOP_UUID",
    "replacementPriceAmount": "5000",
    "replacementPriceCurrency": "NGN"
  }'
```

### 5. Assign Staff to Shops

```bash
curl -X POST https://api.mezzoescrow.xyz/shops/SHOP_UUID/staff \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "STAFF_USER_UUID"
  }'
```

### 6. Schedule Overage Accrual Cron Job

Rental overage charges accrue automatically when due. Set up a cron job to trigger the accrual endpoint:

```bash
# Add to crontab (runs every hour)
0 * * * * curl -X POST https://api.mezzoescrow.xyz/rentals/accrue-overages \
  -H "Authorization: Bearer INTERNAL_CRON_TOKEN" \
  --silent --output /dev/null
```

Or use Docker Compose with a scheduled task runner.

## Monitoring

### Check Service Logs

```bash
docker compose -f docker-compose.prod.yml logs -f charge
```

### Health Checks

- **Charge app**: `https://charge.mezzoescrow.xyz/`
- **API health**: `https://api.mezzoescrow.xyz/health`

### Common Issues

1. **502 Bad Gateway**: Charge service not running or reverse proxy misconfigured
   - Check: `docker compose -f docker-compose.prod.yml ps charge`
   - Check: Proxy upstream points to `localhost:3002`

2. **CORS errors**: Ensure API `CORS_ORIGINS` includes `https://charge.mezzoescrow.xyz`

3. **Verification photo upload fails**: Check S3/MinIO credentials and bucket permissions

4. **Checkout fails**: Ensure customer is verified and has sufficient wallet balance

## Rollback

To rollback to previous version:

```bash
docker compose -f docker-compose.prod.yml down charge
docker compose -f docker-compose.prod.yml up -d charge
```

Or redeploy from a specific image tag:

```bash
docker compose -f docker-compose.prod.yml pull charge:previous-tag
docker compose -f docker-compose.prod.yml up -d charge
```

## Support

For issues, check:
- API logs: `docker compose -f docker-compose.prod.yml logs api`
- Database connectivity: `docker compose -f docker-compose.prod.yml exec postgres psql -U mezzo -c "SELECT version();"`
- Redis connectivity: `docker compose -f docker-compose.prod.yml exec redis redis-cli ping`
