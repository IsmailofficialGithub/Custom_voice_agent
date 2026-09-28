# API

All REST endpoints prefixed `/api/v1`. Auth: `Authorization: Bearer <API_KEY>` header (single-user, static key from env).

## Agents

### `POST /api/v1/agents`
Create a persona.
```json
// Request
{
  "name": "Finance Advisor",
  "system_prompt": "You are a careful, precise personal finance advisor...",
  "enabled_tools": ["web_search", "get_time", "search_knowledge_base"],
  "llm_provider": "claude",
  "llm_model": "claude-sonnet-4-6"
}
// Response 201
{ "id": "uuid", "name": "Finance Advisor", ... }
```

### `GET /api/v1/agents`
List all agents.

### `GET /api/v1/agents/:id`
Get one agent config.

### `PATCH /api/v1/agents/:id`
Update system prompt / tools / model.

### `DELETE /api/v1/agents/:id`
Delete agent (cascades conversations + documents).

## Documents (RAG)

### `POST /api/v1/agents/:id/documents`
Upload a PDF. `multipart/form-data`, field `file`.
```json
// Response 202 — processing happens async
{ "id": "uuid", "filename": "syllabus.pdf", "status": "processing" }
```

### `GET /api/v1/agents/:id/documents`
List documents + status (`processing` | `ready` | `failed`).

### `DELETE /api/v1/documents/:id`
Remove a document and its chunks.

## Conversations

### `POST /api/v1/agents/:id/conversations`
Start a new conversation session.
```json
{ "id": "uuid", "agent_id": "uuid", "started_at": "..." }
```

### `GET /api/v1/conversations/:id/messages`
Get full transcript of a conversation.

## Voice Session (WebSocket)

### `WS /api/v1/voice/:conversation_id`

Bidirectional stream. Client sends binary audio chunks; server sends transcript events and audio chunks back.

**Client → Server messages:**
```json
{ "type": "audio_chunk", "data": "<base64 PCM chunk>" }
{ "type": "end_of_turn" }
```

**Server → Client messages:**
```json
{ "type": "partial_transcript", "text": "what is the current..." }
{ "type": "final_transcript", "text": "what is the current interest rate" }
{ "type": "tool_call", "tool": "web_search", "input": { "query": "current fed interest rate" } }
{ "type": "response_text_chunk", "text": "The current federal funds rate is..." }
{ "type": "audio_chunk", "data": "<base64 audio>" }
{ "type": "end_of_response" }
{ "type": "error", "message": "..." }
```

## Text-Only Fallback (for testing without voice)

### `POST /api/v1/conversations/:id/messages`
Send a text message, get a text response — bypasses STT/TTS entirely. Use this to test/validate the orchestrator, RAG, and memory before wiring voice.
```json
// Request
{ "content": "Quiz me on chapter 3" }
// Response
{ "role": "assistant", "content": "..." }
```

## Error Format

```json
{ "error": { "code": "AGENT_NOT_FOUND", "message": "No agent with that id" } }
```
