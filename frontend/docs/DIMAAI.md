# DimaAI (Dima 1.1)

In-app assistant inside Descall. Users only see DimaAI / Dima 1.1.

## 1.1 highlights

- Progressive SSE streaming with Stop
- Collapsible thinking when provider emits thoughts (no fake thoughts)
- Code blocks: language label, highlight, Copy, Download
- Descall identity in system prompt (Founder and CEO: Demir Sarp Kurtlar)
- Authorized tools for user/servers/channels/roles/permissions; web search + memory tools
- **Personal agent:** Dima can act as the signed-in user (DMs, groups, channels, friends, status). Reads run immediately. Writes stage a draft and only send after in-app Approve.
- Message actions: Copy/Regenerate/Retry/Share; user Edit and resend
- File uploads (PDF/TXT/DOCX/CSV/images) with multimodal image path
- Web search citations under answers
- Memory (hatırla / ne hatırlıyorsun / unut) with settings + manage UI
- Custom instructions + Dima model picker (1.1 Fast/Turbo, 1.2 Thinking/Pro, 1.3 Deep — public labels only)
- Voice STT (mic) + optional TTS; chat pin/favorite/export/share/search

## Provider keys

Admin panel -> DimaAI. Optional Render env GEMINI_API_KEY*. Failover on auth/unavailable only.
Optional `BRAVE_SEARCH_API_KEY` for higher-quality web search (DuckDuckGo HTML fallback).

## SQL

Apply `supabase/migrations/20260816_dimaai.sql`, `20260822_dimaai_1_1_p1.sql`, and `20260825_dimaai_personal_agent.sql` (`agent_enabled` + pending actions).

## Deploy

Merge so Render redeploys /api/dimaai; Vercel picks up the SPA.
