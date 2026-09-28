# Development

## Prerequisites

- Node.js 20 LTS
- pnpm (`npm i -g pnpm`)
- Docker + Docker Compose
- PostgreSQL 16 (via Docker, see below — no local install needed)

## Environment Variables

```bash
# .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/voiceagent

# LLM
LLM_PROVIDER=claude              # claude | openai
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# STT
STT_PROVIDER=deepgram            # deepgram | whisper-local
DEEPGRAM_API_KEY=

# TTS
TTS_PROVIDER=openai              # openai | kokoro-local | elevenlabs
ELEVENLABS_API_KEY=

# Web search
SEARCH_PROVIDER=brave            # brave | tavily
BRAVE_SEARCH_API_KEY=

# Embeddings
EMBEDDING_PROVIDER=openai        # openai | local
EMBEDDING_MODEL=text-embedding-3-small

# Auth
API_KEY=                         # your own generated static key, single-user

PORT=3000
```

## Local Setup

```bash
git clone <repo>
cd voice-agent
cp .env.example .env             # fill in keys above

docker compose up -d postgres    # starts Postgres with pgvector

pnpm install
pnpm prisma migrate dev          # applies schema from DATABASE.md
pnpm run start:dev               # starts NestJS with hot reload
```

## Folder Structure

```
src/
├── agents/            # agent CRUD, persona config
├── conversations/     # conversation + message persistence
├── documents/         # PDF upload, ingestion pipeline
├── orchestrator/       # core turn loop: LLM call, tool dispatch, streaming
├── tools/
│   ├── web-search.tool.ts
│   ├── time.tool.ts
│   └── knowledge-base.tool.ts
├── providers/
│   ├── llm/           # claude.provider.ts, openai.provider.ts
│   ├── stt/           # deepgram.provider.ts, whisper-local.provider.ts
│   └── tts/           # openai.provider.ts, kokoro-local.provider.ts, elevenlabs.provider.ts
├── memory/            # summarization + long-term memory retrieval
├── voice-gateway/     # WebSocket gateway for audio streaming
└── common/            # shared DTOs, guards, interceptors
```

## Conventions

- One provider interface per capability (`LlmProvider`, `SttProvider`, `TtsProvider`, `SearchProvider`) — never call a vendor SDK directly outside its provider module. This is what makes self-hosted/managed/premium a config swap, not a rewrite.
- Commit convention: Conventional Commits (`feat:`, `fix:`, `chore:`)
- Branch convention: `phase-1-core-brain`, `phase-2-rag`, etc. — matches TASKS.md phases
- Test the orchestrator via the text-only endpoint (`POST /conversations/:id/messages`) before wiring voice — isolates LLM/RAG/memory bugs from STT/TTS bugs

## Testing

```bash
pnpm test              # unit tests
pnpm test:e2e           # API integration tests
```

Prioritize testing: tool-calling dispatch logic, RAG retrieval relevance, memory summarization triggers. Voice I/O is best validated manually (latency and audio quality don't unit-test well).

## CI

GitHub Actions: lint + unit tests on every push. See `.github/workflows/ci.yml`.
