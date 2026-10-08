# Agent Start & End Phase (Dynamic Wake & Farewell Termination Lifecycle) Spec

## 1. Overview & Goals
Currently, voice sessions immediately enter continuous active conversation upon WebSocket connection. Every utterance, background noise, or unintended speech is passed directly to the LLM. Furthermore, conversations have no conversational trigger to end the session other than manual UI button clicks.

This feature introduces a two-phase lifecycle per agent session:
1. **Standby Phase (Waiting for Start Message)**:
   - Session connects in `standby` mode.
   - Speech is transcribed via STT, but non-wake utterances are ignored (no LLM generation, saving tokens).
   - When the user utters the agent's dynamic `startPhrase` (e.g., *"hey boss"*):
     - **Standalone wake** (*"Hey boss"*): Agent speaks a friendly activation greeting (*"Hey! I'm listening, how can I help you?"*) and enters `active` phase.
     - **Combined command** (*"Hey boss, what's the weather?"*): Agent strips the start phrase, enters `active` phase, and immediately processes the request via LLM.
2. **Active Phase (Working & Conversing)**:
   - Full bidirectional conversation continues naturally with LLM + tool execution + TTS streaming.
3. **End Phase (Farewell & Session Termination)**:
   - When the user utters the agent's dynamic `endPhrase` (e.g., *"goodbye"*, *"stop"*, *"bye"*, *"end call"*):
     - The agent speaks the farewell message (*"Goodbye! Talk to you soon."*) via TTS.
     - Once TTS audio playback concludes, the backend sends a `{ type: 'session_ended', reason: 'end_phrase_triggered' }` WebSocket event.
     - The frontend client tears down media streams, cleans up WebSocket, and cleanly ends the call session.

Every agent has its own dynamic, configurable `startPhrase`, `endPhrase`, and `farewellMessage`.

---

## 2. Data Model & Configuration

### Prisma Schema (`backend/prisma/schema.prisma`)
Add to `model Agent`:
```prisma
model Agent {
  // existing fields...
  startPhrase     String   @default("hey boss") @map("start_phrase")
  endPhrase       String   @default("goodbye") @map("end_phrase")
  farewellMessage String   @default("Goodbye! Talk to you soon.") @map("farewell_message")
  // ...
}
```

### Backend DTOs (`backend/src/agents/agents.dto.ts`)
* `CreateAgentDto`:
  - `startPhrase`: `string` (required, min 1 char, default "hey boss")
  - `endPhrase`: `string` (required, min 1 char, default "goodbye")
  - `farewellMessage`: `string` (optional, default "Goodbye! Talk to you soon.")
* `UpdateAgentDto`:
  - Same fields as optional.

---

## 3. Voice Gateway Lifecycle (`backend/src/voice-gateway/voice.gateway.ts`)

### Session State
Extend `VoiceSession`:
```typescript
interface VoiceSession {
  // existing fields...
  lifecycleState: 'standby' | 'active' | 'ending';
  startPhrase: string;
  endPhrase: string;
  farewellMessage: string;
}
```

### Turn Handling Logic
1. **Normalization helper**:
   - Strips leading/trailing punctuation (`.,!?;:`), trims, and converts to lowercase.
   - Example: `"Hey boss!"` $\rightarrow$ `"hey boss"`.

2. **In `standby` State**:
   - Check if normalized transcript matches `startPhrase` or starts with `startPhrase`.
   - **No match**: Send WS notification `{ type: 'status', status: 'standby', message: 'Waiting for wake phrase' }` and `{ type: 'end_of_response' }`. LLM is NOT called.
   - **Match**:
     - Transition `session.lifecycleState = 'active'`.
     - Send `{ type: 'lifecycle_change', state: 'active' }`.
     - Extract command remainder after `startPhrase`.
     - If remainder is empty: speak default wake greeting (*"Hey! I'm listening, how can I help you?"*) via TTS.
     - If remainder has content: execute remainder text through `orchestrator.handleTextTurnStream(...)`.

3. **In `active` State**:
   - Check if normalized transcript matches `endPhrase` (e.g. contains or equals `endPhrase`).
   - **No match**: Normal flow (`orchestrator.handleTextTurnStream(...)`).
   - **Match**:
     - Transition `session.lifecycleState = 'ending'`.
     - Stream farewell TTS message (`session.farewellMessage`).
     - Once farewell TTS finishes, emit `{ type: 'session_ended', reason: 'end_phrase_triggered' }`.
     - Gracefully close connection or mark session ended.

---

## 4. Frontend Client & UI (`frontend`)

### Voice Client (`frontend/src/lib/voice-client.ts`)
- New states in `VoiceState`: `'standby'`.
- New event handlers in `VoiceEventHandlers`:
  - `onLifecycleChange?: (state: 'standby' | 'active' | 'ending') => void`
  - `onSessionEnded?: (reason: string) => void`
- When `session_ended` is received, call `onSessionEnded` and gracefully disconnect media stream and WebSocket.

### UI Workspace (`frontend/src/components/audio/chat-workspace.tsx`)
- Display agent's trigger badges:
  - When in standby: *"Say '[startPhrase]' to start"* (e.g. *"Say 'Hey boss' to start"*). Orb in calm waiting pulse.
  - When active: *"Active • Say '[endPhrase]' to stop"*. Orb in active voice mode.
- When session ends, show a smooth call ended transition and trigger `onClose()`.

### Agent Creation & Edit Modal (`frontend/src/app/playground/page.tsx`)
- Input fields for:
  - Start Message / Wake Phrase (default: `"hey boss"`)
  - End Message / Stop Phrase (default: `"goodbye"`)
  - Farewell Audio Message (default: `"Goodbye! Talk to you soon."`)
