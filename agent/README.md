# Voice Agent — Personal Configurable Voice AI

A personal voice assistant where the persona, knowledge, and tools are configurable per "agent." Talk to it like a phone call; set it as a finance advisor, exam coach, or anything else via a system prompt config — no redeploy needed.

## Core Features

- **Custom personas** — define role/behavior per agent via system prompt + tool permissions
- **Conversation memory** — short-term (session window) + long-term (summarized, recalled across sessions)
- **Document upload (RAG)** — upload PDFs/books, ask questions answered from their actual content
- **Exam quiz mode** — feed a syllabus/outline, agent identifies likely-tested topics and quizzes you
- **Live web search** — real-time information via search tool
- **Time/timezone awareness** — always knows current date/time, handles timezone math
- **Voice I/O** — speech-to-text in, text-to-speech out, streamed for low latency

## Quick Start

```bash
git clone <repo>
cd voice-agent
cp .env.example .env        # fill in API keys — see DEVELOPMENT.md
docker compose up -d postgres
npm install
npm run migrate
npm run start:dev
```

## Docs Index

| Doc | Contents |
|---|---|
| [PRD.md](./PRD.md) | Problem, goals, use cases, success criteria |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, component diagram |
| [TECH_STACK.md](./TECH_STACK.md) | Every technology used and why |
| [DATABASE.md](./DATABASE.md) | Schema, tables, pgvector setup |
| [API.md](./API.md) | REST + WebSocket endpoint contracts |
| [UI_UX.md](./UI_UX.md) | Screens, flows, voice interaction states |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local setup, env vars, conventions |
| [AI_RULES.md](./AI_RULES.md) | System prompt rules, tool-use policy, guardrails |
| [INFRA.md](./INFRA.md) | Deployment, Docker Compose, server specs |
| [TASKS.md](./TASKS.md) | Build checklist by phase, 7–9 day plan |

## Status

Planning complete. Build not started. Target: working v1 in 7–9 days (see TASKS.md).
