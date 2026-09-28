# Database

PostgreSQL 16 + `pgvector` extension. One database, no separate vector store.

## Setup

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Schema

### `agents` — persona configs

```sql
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                -- "Finance Advisor", "Exam Coach"
  system_prompt TEXT NOT NULL,
  enabled_tools TEXT[] NOT NULL DEFAULT '{}',  -- ['web_search', 'get_time', 'search_knowledge_base']
  llm_provider  TEXT NOT NULL DEFAULT 'claude',
  llm_model     TEXT NOT NULL DEFAULT 'claude-sonnet',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `conversations` — one per session

```sql
CREATE TABLE conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title      TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ
);
```

### `messages` — turn-by-turn transcript

```sql
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content         TEXT NOT NULL,
  tool_name       TEXT,               -- set if role = 'tool'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

### `documents` — uploaded PDFs/books

```sql
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'processing', -- processing | ready | failed
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `document_chunks` — embedded chunks for RAG

```sql
CREATE TABLE document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(1536) NOT NULL,   -- dimension matches embedding model used
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### `memories` — long-term summarized memory

```sql
CREATE TABLE memories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,            -- summarized fact/preference
  embedding  VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memories_embedding ON memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## Retrieval Queries

**RAG chunk retrieval (top-5 by cosine similarity):**
```sql
SELECT content, 1 - (embedding <=> $1) AS similarity
FROM document_chunks
WHERE document_id IN (SELECT id FROM documents WHERE agent_id = $2 AND status = 'ready')
ORDER BY embedding <=> $1
LIMIT 5;
```

**Long-term memory retrieval (top-3 relevant memories):**
```sql
SELECT content, 1 - (embedding <=> $1) AS similarity
FROM memories
WHERE agent_id = $2
ORDER BY embedding <=> $1
LIMIT 3;
```

## Notes

- `VECTOR(1536)` matches OpenAI `text-embedding-3-small`. If using a self-hosted embedding model (e.g. `bge-small`, 384-dim), change the dimension accordingly — it must match across `document_chunks` and `memories`.
- Single-user system: no `users` table in v1. Add one later if multi-user support becomes a goal.
- Run `ANALYZE` after bulk-loading chunks so `ivfflat` index statistics stay accurate.
