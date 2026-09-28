# Tasks

Total target: **7–9 days**. Build and validate everything on the text-only endpoint before wiring voice — isolates orchestrator/RAG/memory bugs from STT/TTS bugs.

## Phase 1 — Core Brain (1–2 days)

- [ ] Scaffold NestJS project, connect Postgres via Prisma
- [ ] `agents` table + CRUD endpoints (`POST/GET/PATCH/DELETE /agents`)
- [ ] `LlmProvider` interface + Claude/OpenAI implementations
- [ ] Orchestrator: assemble system prompt (base rules + persona) → call LLM → return text
- [ ] `get_time` tool (no external API, pure function)
- [ ] `web_search` tool via Brave Search API
- [ ] Tool-calling loop: LLM requests tool → execute → feed result back → final response
- [ ] Text-only endpoint (`POST /conversations/:id/messages`) working end-to-end
- [ ] Manual test: create "Finance Advisor" agent, ask a time-sensitive question, confirm web_search fires

## Phase 2 — Document Upload / RAG (1 day)

- [ ] `documents` + `document_chunks` tables, pgvector extension enabled
- [ ] PDF upload endpoint, async text extraction (`pdf-parse`)
- [ ] Chunking (500–800 tokens, ~100 overlap)
- [ ] Embedding pipeline (OpenAI `text-embedding-3-small` or local model)
- [ ] `search_knowledge_base` tool wired into orchestrator
- [ ] Manual test: upload a PDF, ask a question only answerable from its content, confirm grounded answer

## Phase 3 — Memory (1 day)

- [ ] `memories` table + embedding column
- [ ] Short-term: rolling window of last N messages included in every prompt
- [ ] Long-term: summarization job triggered after N turns or session end
- [ ] Memory retrieval wired into orchestrator (top-3 relevant, by embedding similarity)
- [ ] Manual test: mention a fact in session 1, confirm it's recalled unprompted in session 2

## Phase 4 — Voice I/O, Managed Path (1–2 days)

- [ ] `SttProvider` interface + Deepgram implementation (streaming)
- [ ] `TtsProvider` interface + OpenAI TTS implementation (streaming)
- [ ] WebSocket gateway: audio in → STT → orchestrator → TTS → audio out
- [ ] Client: mic capture, WebSocket audio streaming, playback of streamed TTS audio
- [ ] Live partial-transcript display in client UI
- [ ] Manual test: full voice round-trip under ~2 seconds, persona/RAG/memory all functioning over voice

## Phase 5 — Polish & Deploy (1–2 days)

- [ ] Dockerfile + docker-compose.yml finalized (see INFRA.md)
- [ ] Deploy to Vultr VPS, reverse proxy (Caddy) + TLS
- [ ] Basic error handling: tool failures, STT/TTS dropouts, LLM timeouts all surfaced to user, never silent
- [ ] `/health` endpoint + uptime monitor
- [ ] Daily `pg_dump` backup cron
- [ ] Exam quiz mode: verify multi-question flow (one at a time, feedback per answer) against a real syllabus PDF
- [ ] Final walkthrough of all PRD success criteria

## Explicitly Deferred (v2+)

- Interruption/barge-in handling during TTS playback
- Self-hosted STT/TTS (Whisper/Kokoro) — only if managed cost or latency becomes a real problem
- Multi-user support
- Native mobile app
