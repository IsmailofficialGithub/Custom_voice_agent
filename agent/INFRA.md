# Infrastructure

## Server

Existing Vultr VPS, reused for this project.

| Approach | Recommended spec | Notes |
|---|---|---|
| Managed voice (STT/TTS via API) | 2 vCPU / 2GB RAM | App + Postgres only, no local model inference |
| Self-hosted voice (Whisper + Kokoro) | 4 vCPU / 8GB RAM | CPU-only inference is fine for single-user, non-realtime-critical use |

Start on the managed path spec; resize the instance later if you move STT/TTS in-house — don't provision for self-hosting until you actually need it.

## Docker Compose

```yaml
version: "3.9"
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: voiceagent
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Only add if using self-hosted STT/TTS:
  # whisper:
  #   image: <faster-whisper server image>
  #   restart: unless-stopped
  #
  # kokoro:
  #   image: <kokoro-tts server image>
  #   restart: unless-stopped

volumes:
  pgdata:
```

## Deployment

```bash
# On the VPS
git pull
docker compose build app
docker compose up -d
docker compose exec app pnpm prisma migrate deploy
```

## Security

- SSH key-only auth (already configured on your Vultr box — carry the same pattern forward)
- Firewall: only expose 443 (reverse-proxied to app) and 22 (SSH); keep 5432 bound to localhost/internal network only, not public
- Put the app behind a reverse proxy (Caddy or nginx) for TLS termination — Caddy is simplest for auto-HTTPS
- Store `.env` outside version control; rotate the static API key if it ever leaks

## Backups

- `pg_dump` the database on a daily cron, retain last 7 days locally, optionally sync to object storage (Vultr Object Storage / S3-compatible)
- Uploaded PDFs: back up alongside the DB dump, or re-derive from source since chunks/embeddings are regenerable

## Monitoring (minimal, v1)

- Docker Compose `restart: unless-stopped` handles crash recovery
- Log to stdout, `docker compose logs -f app` for debugging
- Add a `/health` endpoint checked by an uptime pinger (e.g. UptimeRobot free tier) — skip a full observability stack (Prometheus/Grafana) until this is more than a personal tool

## Scaling Notes (not needed for v1, noted for later)

- Single VPS handles single-user voice sessions comfortably
- If concurrent users are ever added: move STT/TTS self-hosted inference to a dedicated GPU box, keep the app/DB on the current VPS, and put a queue (Redis/BullMQ) in front of document ingestion
