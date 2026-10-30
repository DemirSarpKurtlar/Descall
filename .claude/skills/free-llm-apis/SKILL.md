---
name: free-llm-apis
description: Catalog of free LLM API providers and models (limits, endpoints, OpenAI-compatible base URLs, config snippets for Claude Code, Codex, Cursor). Use when the user asks for a free or cheap model/API, wants to compare free tiers, or needs a provider config. Reference data only; it never calls a provider by itself.
---

# Free LLM APIs (reference)

Source: awesome-free-llm-apis (MIT, see LICENSE), snapshot of 2026-10-20. Limits and model lists change often: say so, and check the provider's own page or https://freellm.net before relying on a number.

- `references/providers.md`: the provider/model tables (free limits, base URLs, notes).
- `references/claude-code.md`, `codex.md`, `cursor.md`: how to point each tool at a provider.

Rules:
- Read the relevant table section instead of answering from memory.
- Never put an API key in code, a commit or a chat reply; keys go in the environment (for Descall: backend env vars, never `VITE_*`).
- Free tiers can log prompts or train on them: mention it before suggesting one for user data.
