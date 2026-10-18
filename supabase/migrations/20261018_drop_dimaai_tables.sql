-- 2.11.1: drop the legacy DimaAI tables (assistant removed in 2.9.141).
-- Approved by Demir. Backup (schema + data) taken first: /workspace/backups/dimaai-2026-10-18/.
-- No CASCADE: if any non-dimaai object (FK, view, function, policy) depended on these
-- tables the drop fails instead of silently removing it. Checked before apply: none.
-- Touches nothing outside public.dimaai_*.
DROP TABLE IF EXISTS
  public.dimaai_pending_actions,
  public.dimaai_messages,
  public.dimaai_attachments,
  public.dimaai_files,
  public.dimaai_conversations,
  public.dimaai_project_notes,
  public.dimaai_projects,
  public.dimaai_memories,
  public.dimaai_memory_prefs,
  public.dimaai_agents,
  public.dimaai_user_settings,
  public.dimaai_provider_keys
RESTRICT;
