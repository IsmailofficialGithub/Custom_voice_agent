# Tech Stack

## Backend

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 LTS | Chosen for speed of development; latency is API-bound, not runtime-bound (see rationale in project chat log) |
| Framework | NestJS + TypeScript | Structured, modular, matches existing project conventions (Trackese) |
| Realtime transport | `ws` (native WebSocket) or Socket.IO | Bidirectional audio streaming + streamed text/audio responses |
| Validation | `class-validator` / `zod` | Request/DTO validation |
| ORM | Prisma | Type-safe Postgres access, easy migrations, pgvector support via raw SQL extension |

## Data

| Layer | Choice | Why |
|---|---|---|
| Primary DB | PostgreSQL 16 | Single database for everything — no extra services |
| Vector search | pgvector extension | Document embeddings + similarity search live in the same DB |
| Cache/session (optional) | Redis | Only if session state needs to survive gateway restarts; skip for v1 single-instance |

## AI Providers (abstracted behind provider interfaces — swappable via env var)

| Function | Managed default | Self-hosted alternative | Premium alternative |
|---|---|---|---|
| LLM (thinking) | Claude API or GPT-4o | — (not practical to self-host at quality needed) | — |
| STT (listening) | Deepgram Nova-3 | Whisper (`faster-whisper`, CPU, int8) | ElevenLabs Scribe |
| TTS (speaking) | OpenAI TTS | Kokoro-82M / Piper | ElevenLabs |
| Web search | Brave Search API | — | Tavily |
| Embeddings | OpenAI `text-embedding-3-small` | `bge-small` (self-hosted, sentence-transformers) | — |

## Document Processing

| Task | Tool |
|---|---|
| PDF text extraction | `pdf-parse` (Node) or `pdfplumber` (if a Python sidecar is used for ingestion) |
| Chunking | Custom — 500–800 tokens, ~100 token overlap |

## Infra

| Layer | Choice |
|---|---|
| Containerization | Docker + Docker Compose |
| Hosting | Existing Vultr VPS |
| Process management | Docker Compose restart policies (`unless-stopped`) |
| Secrets | `.env` file, not committed; consider Doppler/Vault later |

## Dev Tooling

| Tool | Purpose |
|---|---|
| pnpm | Package manager |
| ESLint + Prettier | Linting/formatting |
| Jest | Unit/integration tests |
| GitHub Actions | CI (lint + test on push) — matches existing tooling anchor |

## Explicitly Not Used (v1)

- LangChain/LlamaIndex — unnecessary abstraction over direct provider SDKs + tool-calling at this scale
- Kubernetes — single VPS, Docker Compose is sufficient
- Rust/Go for orchestration — latency is network/API-bound, not runtime-bound
