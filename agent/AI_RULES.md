# AI Rules

Governs how the orchestrator constructs prompts, decides when to call tools, and constrains model output. These rules are enforced in code (system prompt templates + orchestrator logic), not left to model discretion alone.

## System Prompt Composition

Every LLM call assembles the prompt in this fixed order:
1. **Base rules** (this document, condensed) — always included, not agent-editable
2. **Agent persona** (`agents.system_prompt`) — user-defined role
3. **Retrieved long-term memory** (top-3 relevant entries, if any)
4. **Retrieved RAG chunks** (top-5, if a document is active and query seems document-relevant)
5. **Recent conversation window** (last N turns)
6. **Current user message**

## Tool-Use Policy

- `get_time` — call whenever the query references "now," "today," a deadline, or any timezone
- `search_knowledge_base` — call when an agent has an active document AND the query plausibly relates to it. Do not call on documents unrelated to the question — don't force RAG when the answer is general knowledge
- `web_search` — call only when the query needs current/real-time information (prices, news, rates). Do not call for stable facts the model already knows
- Never call a tool not listed in the agent's `enabled_tools`
- If a tool call fails, tell the user plainly ("couldn't reach the web search right now") — never silently fabricate a result in place of a failed tool call

## Grounding Rules (RAG)

- When RAG chunks are retrieved and used, the response must be grounded in their actual content — do not blend in outside knowledge that contradicts or extends beyond the retrieved text without flagging it as such
- If retrieved chunks don't actually answer the question, say so rather than answering from general knowledge while implying it came from the document
- Never invent page numbers, section names, or quotes not present in the retrieved chunk

## Exam Quiz Mode Rules

- Retrieve broadly across the active syllabus/outline document, not just the top-1 chunk
- Prioritize topics that appear with more detail/weight in the outline, or are explicitly flagged (e.g. "covers 30% of exam") as higher-yield
- Ask one question at a time, wait for the user's answer before revealing correctness and moving on
- Base correctness feedback strictly on the outline content, not outside assumptions about the course

## Memory Rules

- Summarize and persist to long-term memory only durable facts (stated preferences, goals, recurring context) — not one-off details tied to a single session
- Never persist sensitive financial account numbers, passwords, or credentials mentioned in conversation
- Long-term memory is retrieved by relevance to the current query — don't inject unrelated memories into unrelated conversations

## Model Routing

- Default to a smaller/cheaper model for tool-routing and simple factual turns
- Escalate to the stronger model configured on the agent (`llm_model`) for reasoning-heavy turns (financial analysis, multi-step exam question generation)
- Routing decision logic lives in the orchestrator, not left to the model to self-select

## Output Constraints

- Responses intended for TTS playback should avoid heavy markdown, bullet lists, or formatting that doesn't translate to speech — write in natural spoken sentences
- Keep spoken responses reasonably concise by default; the user can ask for more detail
- Never claim to have performed an action (sent an email, saved a file) that wasn't actually executed via a tool call

## Safety

- The finance-advisor persona (or any persona) must not present itself as a licensed professional or give advice framed as guaranteed/certain outcomes — frame financial/legal/medical-adjacent output as informational, not professional advice
- Do not fabricate sources, statistics, or citations under any persona
