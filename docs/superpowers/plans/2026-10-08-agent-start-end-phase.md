# Agent Start and End Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement dynamic, configurable start (wake phrase e.g. "hey boss") and end (farewell phrase e.g. "goodbye" -> graceful session termination) phases per agent across database, backend voice gateway, and frontend UI.

**Architecture:** Extend Agent schema with `startPhrase`, `endPhrase`, and `farewellMessage`. Update VoiceGateway session state machine to enter `standby` mode upon connect, waking up to `active` on matching startPhrase (supporting both standalone greeting and combined command), and gracefully terminating on matching endPhrase after speaking farewell TTS. Frontend updates reflect the phase in ChatWorkspace and agent creation/settings UI.

**Tech Stack:** NestJS, WebSocket (`@nestjs/websockets`), Prisma (PostgreSQL), Next.js, React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-agent-start-end-phase-design.md`

## Global Constraints
- Every agent must have a dynamic `startPhrase` (default: `"hey boss"`) and `endPhrase` (default: `"goodbye"`).
- In `standby` phase, non-wake speech must not call the LLM, preventing credit waste and unwanted interruptions.
- Flexible wake activation: standalone wake (agent greets) and combined command (agent strips wake phrase and immediately executes prompt).
- Graceful termination: agent speaks farewell message via TTS before session closes.

## Review Focus
1. Case-insensitivity & punctuation: "Hey boss!", "hey boss,", "HEY BOSS" must all match "hey boss".
2. Multi-word wake phrases: "hey boss" must match correctly even if Whisper transcribes "Hey, boss".
3. Standby speech filtering: background noise or conversation without the wake phrase must not trigger LLM calls.
4. Combined commands: "hey boss, what time is it?" must wake up the agent and execute "what time is it?".
5. Audio completion before close: WebSocket session must not abruptly disconnect while the farewell audio is still playing in the client.

---

### Task 1: Data Model & Agent Management (Schema, DTOs, Agents Service)

**Files:**
- Modify: `backend/prisma/schema.prisma:14-31`
- Modify: `backend/src/agents/agents.dto.ts:1-64`
- Modify: `backend/src/agents/agents.service.ts`
- Create: `backend/src/agents/agents.service.spec.ts`

**Interfaces:**
- Produces: `Agent` with `startPhrase: string`, `endPhrase: string`, `farewellMessage: string` in DB and DTOs.

- [ ] **Step 1: Write test for agent phrase defaults and DTO validation**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `schema.prisma`, run `npx prisma generate`, update `agents.dto.ts` and `agents.service.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 2: Phrase Normalization & Lifecycle Logic in Backend

**Files:**
- Create: `backend/src/voice-gateway/phrase-matcher.ts`
- Create: `backend/src/voice-gateway/phrase-matcher.spec.ts`

**Interfaces:**
- Produces:
  - `normalizePhrase(text: string): string`
  - `isWakePhraseMatch(transcript: string, wakePhrase: string): { matched: boolean; remainder: string }`
  - `isEndPhraseMatch(transcript: string, endPhrase: string): boolean`

- [ ] **Step 1: Write failing unit test for `phrase-matcher.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `phrase-matcher.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 3: VoiceGateway Lifecycle Integration & Graceful Farewell

**Files:**
- Modify: `backend/src/voice-gateway/voice.gateway.ts`
- Modify: `backend/src/conversations/conversations.service.ts`
- Create: `backend/src/voice-gateway/voice.gateway.spec.ts`

**Interfaces:**
- Consumes: `phrase-matcher.ts`, `Agent` config from `ConversationsService`.
- Produces:
  - Standby state upon connect with `{ type: 'lifecycle_change', state: 'standby' }`.
  - Wake-up transition on start phrase: standalone greeting or LLM command execution.
  - End transition on end phrase: farewell TTS streaming + `{ type: 'session_ended', reason: 'end_phrase_triggered' }`.

- [ ] **Step 1: Write failing test for VoiceGateway turn processing with wake and end phrases**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement lifecycle states, wake detection, and farewell termination in `voice.gateway.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 4: Frontend VoiceClient & ChatWorkspace Lifecycle Integration

**Files:**
- Modify: `frontend/src/lib/voice-client.ts`
- Modify: `frontend/src/components/audio/chat-workspace.tsx`

**Interfaces:**
- Consumes: WS events `lifecycle_change` and `session_ended`.
- Produces:
  - `VoiceState`: `'standby' | 'active' | ...`
  - `onSessionEnded` callback in `VoiceSessionClient`.
  - Dynamic badges in `ChatWorkspace`: *"Say '[startPhrase]' to start"* vs *"Active • Say '[endPhrase]' to stop"*.
  - Clean audio teardown and call closing when session ends.

- [ ] **Step 1: Update `voice-client.ts` with standby state and `session_ended` handler**
- [ ] **Step 2: Update `chat-workspace.tsx` with dynamic phase indicators and auto-close on end**
- [ ] **Step 3: Commit changes**

---

### Task 5: Frontend Agent Configuration UI

**Files:**
- Modify: `frontend/src/lib/api-client.ts`
- Modify: `frontend/src/app/playground/page.tsx`

**Interfaces:**
- Consumes: `Agent.startPhrase`, `Agent.endPhrase`, `Agent.farewellMessage`.
- Produces: Form fields in Agent creation modal for startPhrase, endPhrase, farewellMessage.

- [ ] **Step 1: Update `api-client.ts` Agent interface and createAgent payload**
- [ ] **Step 2: Update `page.tsx` modal with startPhrase, endPhrase, and farewellMessage inputs**
- [ ] **Step 3: Commit changes**

---

### Task 6: Full Verification & Build Checks

- [ ] **Step 1: Run all backend tests (`npm test` in `backend`)**
- [ ] **Step 2: Run backend production build (`npm run build` in `backend`)**
- [ ] **Step 3: Run frontend production build (`npm run build` in `frontend`)**
- [ ] **Step 4: Final verification and summary**
