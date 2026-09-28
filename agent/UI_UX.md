# UI/UX

Minimal web client — voice is the primary interaction, UI just supports it. No native mobile app in v1.

## Screens

### 1. Agent Selector (Home)
- List of created agents (persona cards: name + short description)
- "New Agent" button → opens agent creation form
- Tapping an agent → opens the Conversation screen for that agent

### 2. Agent Creation / Edit
- Fields: Name, System Prompt (textarea), Enabled Tools (checkboxes: Web Search, Time, Knowledge Base), Model selector
- Document upload section (drag-and-drop PDF, shows processing status per file)

### 3. Conversation (main voice screen)
- Large mic button — press-to-talk or tap-to-toggle (configurable)
- Visual state indicator: **Idle → Listening → Thinking → Speaking**
- Live transcript feed (both user speech-to-text and agent responses, scrollable)
- Small waveform/pulse animation during listening and speaking states
- Text input fallback at the bottom (type instead of speak)
- Persona name shown in header, tap to switch agent mid-session

### 4. Document Library (per agent)
- List of uploaded documents with status badges
- Delete/re-upload actions
- Optional: preview extracted text for sanity-checking ingestion

## Interaction States

```
IDLE ──(user taps mic)──▶ LISTENING ──(silence detected / user taps stop)──▶ THINKING
THINKING ──(tool call in progress)──▶ shows "Searching the web..." / "Checking your documents..."
THINKING ──(response ready)──▶ SPEAKING ──(playback ends)──▶ IDLE
```

- Show which tool is active during THINKING (transparency — user sees "Searching the web..." not a generic spinner)
- Allow barge-in: tapping mic during SPEAKING interrupts playback and returns to LISTENING (v2 — not required for v1)

## Voice Interaction Principles

- Never leave the user wondering if it heard them — always show partial transcript live as they speak
- Always show *which* tool is running, not just "thinking" — builds trust that answers are grounded
- Text fallback always available — voice can fail (noisy environment, mic issues), don't block the user

## Visual Style

- Dark mode default (voice-first apps are often used in low-light/late-night contexts)
- Single accent color per agent (optional — lets you visually distinguish "Finance Advisor" from "Exam Coach" at a glance)
- Minimal chrome — the mic button and transcript are the interface, no dashboard clutter
