# Deploying Mezzo to a Hetzner VPS with Coolify

Target layout — one Coolify resource running the whole stack from
`docker-compose.prod.yml`, with three public hostnames:

| Hostname              | Compose service | Internal port |
| --------------------- | --------------- | ------------- |
| `mezzoescrow.xyz`     | `web`           | 3001          |
| `api.mezzoescrow.xyz` | `api`           | 3000          |
| `s3.mezzoescrow.xyz`  | `minio`         | 9000          |

Postgres and Redis stay on the internal Docker network with no public route.

## Why not the root `docker-compose.yml`

That file is the local development stack. It hardcodes `http://localhost:3000`
into the web image's build args and publishes Postgres, Redis and MinIO on host
ports. On a public server that means a browser bundle pointing at the visitor's
own machine, and three datastores listening on the public interface — Docker
publishes ports via iptables NAT, which bypasses UFW rules. Deploy
`docker-compose.prod.yml` instead: it publishes nothing, exposes only the ports
Traefik routes to, and takes every URL and secret from the environment.

## Step 1 — DNS

At your registrar, point these records at the server's public IPv4:

```
A    @      <SERVER_IP>
A    www    <SERVER_IP>
A    api    <SERVER_IP>
A    s3     <SERVER_IP>
```

If you also want the Coolify dashboard on a hostname, add `A coolify <SERVER_IP>`.

Verify from your laptop before touching Coolify — Let's Encrypt issues
certificates over HTTP-01, so a record that has not propagated means a failed
certificate, not a retryable error:

```bash
dig +short mezzoescrow.xyz api.mezzoescrow.xyz s3.mezzoescrow.xyz
```

All four must return the server IP. If you proxy through Cloudflare, set those
records to **DNS only** (grey cloud) for the first deploy, then enable proxying
once certificates are issued.

## Step 2 — Server prerequisites

SSH in and check you have headroom to build. Two Docker builds (a Nest build and
a Next build, each with a full `pnpm install`) are the memory-hungry part of this
deployment, and Coolify itself holds roughly 1 GB.

```bash
free -h
df -h /
nproc
```

With less than 8 GB of RAM, add swap so the Next build cannot OOM-kill itself:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

Firewall: use the **Hetzner Cloud firewall** in the Hetzner console, not UFW —
UFW does not reliably block Docker-published ports. Allow inbound TCP 22, 80 and 443. Port 8000 is Coolify's dashboard; keep it open only until you put the
dashboard on its own hostname, then close it.

## Step 3 — Push this branch

Coolify deploys from its own clone, pulled over its own credentials. The clone
you made by hand on the server is not used and can be deleted. Commit and push
the two new files from your workstation first:

```bash
git add docker-compose.prod.yml deploy/
git commit -m "feat(deploy): add a production compose stack for Coolify"
git push
```

## Step 4 — Create the resource in Coolify

In the dashboard (`http://<SERVER_IP>:8000`):

1. **Projects → + Add → Project**, name it `mezzo`, then open its `production`
   environment.
2. **+ New → Public Repository** for `https://github.com/Caxton-Dev-Hub/mezzo` —
   the HTTPS URL, not the SSH one. No credentials needed. Do not pick the
   **Docker Compose** tile: it is for pasting a compose file with no repository
   behind it, and it cannot build images from a `build:` context.
3. Set **Branch** to `main`.
4. Set **Build Pack** to **Docker Compose**. This is the setting that matters
   most — Nixpacks and the Dockerfile pack each build a single app and cannot
   bring up the datastores alongside them.
5. Set **Base Directory** to `/` and **Docker Compose Location** to
   `/docker-compose.prod.yml`.

Save. Coolify parses the compose file and lists the five services.

Deploys are manual with a public repository source. Once the Coolify dashboard
has its own hostname, switch the source to **GitHub App** to get a deploy on
every push — setting that up while the dashboard is still on a bare
`http://<SERVER_IP>:8000` tends to fail on the OAuth callback.

## Step 5 — Environment variables

Open the resource's **Environment Variables** tab. Coolify will have detected
every `${VAR}` reference in the compose file and pre-created the entries. Switch
to the Developer view and paste the contents of
[`deploy/coolify.env.example`](coolify.env.example), then fill in the blanks.

Generate the secrets on the server:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
echo "S3_SECRET_ACCESS_KEY=$(openssl rand -base64 24)"
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
```

Then tick **Build Variable** on exactly these five, and no others:

```
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_MAX_UPLOAD_MB
NEXT_PUBLIC_GOOGLE_CLIENT_ID
NEXT_PUBLIC_STELLAR_MODE
```

Next.js inlines `NEXT_PUBLIC_*` values into the client bundle during
`next build`. A runtime-only value is absent at build time, so the bundle falls
back to `http://localhost:3000` and every request from a visitor's browser
fails. This is the single most common way this deployment goes wrong.

Anything declared `${VAR:?}` in the compose file is required — Coolify blocks the
deploy while it is empty rather than starting a half-configured stack.

## Step 6 — Domains

Coolify shows a separate **Domains** field per compose service. Fill in three
and leave `postgres` and `redis` blank. Include the internal port so Traefik
knows where to route:

| Service | Domains field                      |
| ------- | ---------------------------------- |
| `web`   | `https://mezzoescrow.xyz:3001`     |
| `api`   | `https://api.mezzoescrow.xyz:3000` |
| `minio` | `https://s3.mezzoescrow.xyz:9000`  |

`https://` is what triggers automatic Let's Encrypt certificates.

To serve `www` as well, add it comma-separated on `web`
(`https://mezzoescrow.xyz:3001,https://www.mezzoescrow.xyz:3001`) and keep
`CORS_ORIGINS` in step 5 listing both origins.

## Step 7 — Deploy

Hit **Deploy** and watch the log. The first run builds both images from scratch
and takes roughly 10–20 minutes on a 2-vCPU box.

On boot the API container runs `typeorm migration:run` from its entrypoint
whenever `DATABASE_URL` is set, so the schema is created automatically — there
is no separate migration step. The MinIO bucket is created the same way, by
`S3StorageProvider.onModuleInit`.

## Step 8 — Verify

```bash
curl -fsS https://api.mezzoescrow.xyz/health | jq
curl -fsSI https://mezzoescrow.xyz | head -1
curl -fsS https://s3.mezzoescrow.xyz/minio/health/live -o /dev/null -w '%{http_code}\n'
```

`/health` should report `ok` with `database` and `redis` both up. Note that it
checks Postgres and Redis only — it stays green when MinIO is down, and
presigning stays green too, because the API signs URLs locally without
contacting S3. The first symptom of a broken MinIO route is a browser-side
upload failure, so check the `s3` hostname explicitly rather than trusting
`/health`.

Then in a browser, with devtools open on the Network tab:

1. Load `https://mezzoescrow.xyz` and confirm XHRs go to
   `https://api.mezzoescrow.xyz` — not `localhost`. If they go to localhost, the
   build variables in step 5 were not ticked; re-tick and **redeploy**, since the
   value is baked into the image.
2. Register the address you put in `BOOTSTRAP_ADMIN_EMAILS` to get the admin
   account, then verify the email — see the next section, because this step does
   not work on the default settings.
3. Create an escrow and upload evidence, which is the end-to-end check that the
   presigned `PUT` against `s3.mezzoescrow.xyz` works.

### You need a real email provider to log in at all

`AuthService.login` rejects any account whose `email_verified_at` is null, and
there is no environment flag that turns that off. The mailer is chosen by
`NOTIFICATION_EMAIL_PROVIDER`: only the value `resend` sends a real message.
Every other value selects `FakeEmailVerificationMailer`, which pushes the code
onto an in-memory array and neither logs it nor persists it — and the code is
stored in Postgres as a SHA-256 hash, so it cannot be recovered from the
database either. On the default `fake` setting, nobody can ever finish
registering.

So before you try to log in, set all three:

```
NOTIFICATION_EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@mezzoescrow.xyz
```

`RESEND_FROM_EMAIL` must be on a domain you have verified in the Resend
dashboard, which means adding their DKIM and SPF records to `mezzoescrow.xyz`.

If you want to get in before email is wired up, verify the first admin by hand.
Find the Postgres container and flip the column:

```bash
docker ps --filter name=postgres --format '{{.Names}}'
docker exec -it <postgres-container> psql -U mezzo -d mezzo \
  -c "UPDATE users SET email_verified_at = now() WHERE email = 'you@example.com';"
```

Chat and notifications use Socket.IO on the `/ws/chat` and `/ws/notifications`
namespaces of the API host. Traefik proxies WebSocket upgrades without extra
configuration; if the connection fails, the cause is almost always
`CORS_ORIGINS` missing the exact web origin.

## Step 9 — Going live for real

- Set `PAYMENT_PROVIDER` to `paystack` or `flutterwave` and add its keys. The app
  refuses to boot if the selected provider's credentials are missing, so change
  both in the same save.
- Flutterwave webhooks need `FLUTTERWAVE_SECRET_HASH` to match the dashboard.
  Point provider webhooks at `https://api.mezzoescrow.xyz`.
- Turn on **Automatic Deployment** if you connected via GitHub App.
- Set up **Scheduled Backups** on the Postgres service — the named volume is not
  backed up by anything otherwise.
- Close port 8000 once the dashboard has its own hostname.

## Troubleshooting

**Deploy fails with "Invalid environment configuration"** — the Zod schema
rejected something at boot. The API log names every offending variable at once.
Most likely: `STELLAR_MODE=dev` (rejected under `NODE_ENV=production`), a JWT
secret under 32 characters, or a payment provider selected without its keys.

**`PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER is "fake"`** — you are on
a build from before `PAYMENT_PROVIDER_CREDENTIALS` in
`apps/api/src/config/env.schema.ts` was corrected to `fake: []`. Pull `main` and
redeploy, or set any non-empty placeholder to get moving.

**A blank variable crashes the boot** — fixed as of the `stringWithDefault`
helper in `apps/api/src/config/env.schema.ts`: every defaulted string now runs
through the blank-to-undefined preprocessor, so a present-but-empty value falls
back to its default instead of failing `min(1)`. Before that fix a blank
`RESEND_FROM_EMAIL` crash-looped the API on a real deployment. Coolify creates an
entry for every `${VAR}` it finds in the compose file and injects it into the
container even when empty, which is what defeats the compose-level `:-` default —
so a Coolify entry that exists but is blank still overrides it. Pull `main` if you
see this.

**Certificate not issued** — DNS must resolve to this server and port 80 must be
reachable. Re-run the `dig` check from step 1; if you are behind Cloudflare, set
the record to DNS-only.

**Something else already owns port 80** — the single most expensive problem on a
first deploy. A stock nginx from the Ubuntu image holds port 80, so every
Let's Encrypt HTTP-01 challenge lands on nginx and no certificate is ever issued,
while Traefik still answers 443 with `TRAEFIK DEFAULT CERT`. Check with
`sudo ss -tlnp | grep -E ':(80|443) '` — you want `docker-proxy` on both ports and
nothing else. If nginx appears: `sudo systemctl disable --now nginx`, then
`sudo docker restart coolify-proxy`.

**One bad hostname blocks a certificate for its siblings** — every domain on the
same service shares one Traefik router, so Let's Encrypt issues a single
certificate covering all of them and validates each one. A hostname without a DNS
record fails its challenge and takes the whole order down with it, including the
hostnames that would have passed. A stray `www.s3.<domain>` did exactly this.
Delete unused hostnames rather than leaving them to fail.

**`503 no available server` from Traefik** — the router matched but the service
has no backend. Either the container is down (`sudo docker ps`), or the container
is running with stale Traefik labels. Labels are written when a container is
*created*, so a domain change needs a **Deploy**, not a Restart. Confirm what
Traefik was actually told with:

```bash
sudo docker inspect $(sudo docker ps -qf "name=^minio-") \
  -f '{{json .Config.Labels}}' | tr ',' '\n' | grep -i traefik
```

A healthy service shows both an http and an https router plus
`loadbalancer.server.port`.

**`pull access denied for minio/minio`** — MinIO removed their Docker Hub
repository; the image now lives at `quay.io/minio/minio`, pinned in both compose
files to a release tag. `minio/minio:latest` no longer resolves at all.

**Build killed / exit code 137** — out of memory. Add the swap from step 2, or
resize the VPS.

**Browser calls `localhost`** — build variables not ticked. See step 8.
