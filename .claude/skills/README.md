# Project skills (installed 30 Oct 2026, owner request)

Every Claude Code session on this repo loads these automatically. Third-party
content, copied as-is (MIT; licence file in each skill dir), reviewed before
commit: no hooks, settings, MCP servers or auto-run scripts come with them.
Scripts inside a skill run only when a task explicitly calls them.

| Skill | Source | Purpose |
|---|---|---|
| karpathy-guidelines | andrej-karpathy-skills | Careful, minimal, verified changes |
| i-have-adhd | i-have-adhd | Short, scannable replies |
| design-taste-frontend | taste-skill | Visual taste: layout, colour, type, motion, copy |
| make-interfaces-feel-better | make-interfaces-feel-better | Interaction polish (press states, motion, surfaces) |
| apple-design | owner upload | Apple-style fluid motion, materials, typography |
| ui-ux-pro-max, ui-styling, design, design-system, brand, banner-design, slides | ui-ux-pro-max-skill | Design system search, styling, brand, decks |
| free-llm-apis | awesome-free-llm-apis (wrapped here) | Free LLM provider reference |
| skill-pressure-test, skill-review-response, skill-thought-partner, skill-decision-support, skill-security-framing, skill-visual-feedback, skill-coverage-audit, skill-meta-prompt, skill-verification-gate, skill-tdd, skill-debug | claude-octopus (`.claude/skills`, Claude variants) | Slash-command only (`disable-model-invocation`). Mentions of `/octo:*`, providers or `skills/blocks/*` are dead references: the Octopus plugin is not installed. |

Not installed, on purpose (see the audit in the 3.1 session):
- The rest of claude-octopus (≈110 skills): they need the Octopus plugin runtime
  (`orchestrate.sh`, `~/.claude-octopus`) and paid external models (Codex, Gemini,
  Copilot); some commit, push, post PR comments or send code to other providers
  without asking, which breaks this repo's PR/release rules.
- strix (9 skills): need the Strix CLI + Docker or a strix.ai account and LLM keys,
  install with `curl | bash`, two upload source or spend credits.

Repo rules (AGENTS.md) win over any skill: no emoji in the UI, PR + green CI before
merge, App Store only on the owner's word.
