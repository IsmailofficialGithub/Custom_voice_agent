# PRD — Voice Agent

## Problem

Existing voice assistants (Siri, Alexa, ChatGPT voice mode) don't let you fully redefine their role, feed them your own documents as ground truth, or give them persistent memory of you specifically. You want a personal agent that can be "your finance advisor" today and "your exam coach" tomorrow, grounded in documents you provide, that remembers context across sessions.

## Goals

1. Talk to an AI agent by voice, with response latency low enough to feel like a real conversation
2. Switch the agent's persona/role via config, not code changes
3. Upload a PDF and get answers grounded in its actual content
4. Have the agent generate exam questions from an uploaded syllabus, prioritizing likely-tested material
5. Agent has live web search and accurate time/timezone awareness
6. Agent remembers relevant facts across sessions without re-explaining yourself

## Non-Goals (v1)

- Multi-user / multi-tenant support (single user only)
- Mobile native app (web client first)
- Voice cloning / custom TTS voice (use stock voices)
- Real-time interruption handling beyond basic turn-taking (defer to v2)

## Primary Use Cases

| Use case | Flow |
|---|---|
| Finance advisor | Set persona → ask financial questions → agent reasons + optionally web-searches current rates/prices |
| Exam prep | Upload syllabus PDF → ask agent to quiz you → agent retrieves outline, picks high-yield topics, asks questions one at a time |
| Document Q&A | Upload any PDF/book → ask questions → answers grounded in retrieved passages |
| General assistant | Ask time-sensitive or timezone-dependent questions → agent uses time tool |

## Success Criteria

- End-to-end voice round-trip (speak → hear reply) under ~2 seconds on the managed voice path
- RAG answers cite/reflect actual uploaded document content, not generic knowledge, when a document is active
- Persona switch requires no code deploy — just a config change
- Agent recalls a fact mentioned in a prior session without being re-told

## Out of Scope for v1

- Fine-tuning any model
- Custom wake-word detection
- Billing/multi-user accounts

## Milestones

See [TASKS.md](./TASKS.md) — 5 phases, 7–9 days total.
