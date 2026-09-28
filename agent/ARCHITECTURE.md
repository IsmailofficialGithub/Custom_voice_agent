# Architecture

## System Diagram

```
                        ┌─────────────────────┐
                        │   Web Client (mic)   │
                        └──────────┬───────────┘
                                   │ WebSocket (audio stream)
                                   ▼
                        ┌─────────────────────┐
                        │   NestJS Gateway     │
                        │  (WS + REST API)     │
                        └──────────┬───────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 ▼                 ▼                 ▼
          ┌────────────┐   ┌──────────────┐   ┌────────────┐
          │  STT Layer │   │ Orchestrator │   │  TTS Layer │
          │ (Deepgram/ │   │ (LLM + tool  │   │ (OpenAI/   │
          │  Whisper)  │──▶│   calling)   │──▶│  Kokoro)   │
          └────────────┘   └──────┬───────┘   └────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌────────────┐ ┌────────────┐ ┌─────────────┐
             │  Web Search│ │  Time Tool │ │  RAG Search │
             │    Tool    │ │            │ │    Tool     │
             └────────────┘ └────────────┘ └──────┬──────┘
                                                    ▼
                                          ┌───────────────────┐
                                          │ Postgres + pgvector│
                                          │ (docs, chunks,     │
                                          │  memory, agents,   │
                                          │  conversations)    │
                                          └───────────────────┘
```

## Components

### 1. Web Client
Captures mic audio, streams it over WebSocket, plays back TTS audio as it arrives. Shows live transcript + persona selector.

### 2. Gateway (NestJS)
Single entry point. REST endpoints for agent/document management, WebSocket endpoint for the live voice session. Auth via API key (single-user).

### 3. STT Layer
Streams incoming audio chunks to the STT provider, emits partial + final transcripts. Swappable: Deepgram (managed) or self-hosted Whisper — selected via `STT_PROVIDER` env var.

### 4. Orchestrator
The core loop per turn:
1. Receive final transcript text
2. Load agent config (system prompt, enabled tools, active knowledge base)
3. Load short-term memory (last N turns) + retrieve relevant long-term memory
4. Call LLM with system prompt + context + tool definitions
5. If LLM requests a tool call → execute tool → feed result back → repeat until final text response
6. Stream final response text to TTS layer as it's generated
7. After turn: persist message, periodically trigger memory summarization

### 5. Tools
- `web_search(query)` → Brave Search / Tavily API
- `get_time(timezone?)` → IANA tz lookup, no external call
- `search_knowledge_base(query, agent_id)` → embed query, pgvector similarity search, return top-k chunks

### 6. TTS Layer
Takes streamed text from the LLM, converts to audio, streams back to client. Swappable: OpenAI TTS / ElevenLabs (managed) or self-hosted Kokoro/Piper.

### 7. Database
Postgres with pgvector extension. Stores agent configs, conversations, messages, uploaded documents, document chunks + embeddings, long-term memory entries. See [DATABASE.md](./DATABASE.md).

## Turn Sequence (Single Voice Exchange)

```
User speaks
  → audio chunks streamed to STT (partial transcripts shown live)
  → final transcript emitted
  → Orchestrator loads agent config + memory + RAG context
  → LLM call (streaming) — may invoke tools mid-generation
  → tool results fed back into LLM context
  → LLM emits final response text (streamed)
  → text chunks sent to TTS as generated
  → audio streamed back to client, played immediately (no waiting for full response)
```

## Approach Toggle (Self-Hosted / Managed / Premium)

STT/TTS providers are abstracted behind an interface (`SttProvider`, `TtsProvider`) so switching approach is a config change, not a code change:

```
STT_PROVIDER=deepgram | whisper-local
TTS_PROVIDER=openai | kokoro-local | elevenlabs
```

LLM provider (Claude/GPT) is likewise abstracted behind an `LlmProvider` interface for easy swapping/model routing (cheap model for tool-routing turns, stronger model for reasoning-heavy turns).
