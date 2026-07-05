# Skill: Spec Checklist

Purpose
Provide a short, reusable skill/checklist that authors and agents can use to
validate feature specs before implementation. This is a lightweight, non-agentic
artifact — it lists the questions a spec should answer, not a forced Q&A flow.

When to use
- During spec writing: run this checklist to ensure completeness.
- Before handing the spec to Claude Code: confirm the checklist in chat.

Checklist (what a spec must contain)

1. Title & Summary — one-line description and motivation.
2. Scope — what is in scope and explicitly out of scope.
3. UX / UI (end-user visible)
   - All user-facing text must be provided in Finnish (exact strings where possible).
   - Specify where strings appear (page, component, modal, etc.).
4. API & Data
   - List endpoints, required fields, and sample responses.
   - Caching policy (which endpoints, TTL values).
5. Edge Cases — list expected edge behaviours and error states.
6. Performance & Limits — rate limits, pagination, expected load behaviour.
7. Security & Secrets — required env vars and that secrets must not be committed.
8. Acceptance Criteria — testable, concrete outcomes for the feature.
9. Tests Required — file paths and minimal assertions (happy+edge cases).
10. Files To Update — `specs/`, `.env.example`, docs, and any README notes.

How to use in chat
- Paste the spec and run this checklist with Claude. Confirm each item is
  present (yes/no) before creating a PR. If any item is missing, expand the
  spec and re-run the checklist.

Notes
- This lives in `skills/` so agents and humans can reference a single,
  consistent checklist. It intentionally avoids forcing an automated interview
  flow — use conversational clarification instead.
