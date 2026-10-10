-- NEEDS APPROVAL — do not apply until Demir says so.
-- Run this statement by itself in the Supabase SQL editor.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so do not
-- paste it into a migration runner that wraps the file in BEGIN/COMMIT.
--
-- Measured 2026-10-10 on project Descall (read-only EXPLAIN ANALYZE):
--   * one group's latest row via idx_group_messages_created: 0.17 ms
--     (index scan backward, 13 newer rows from other groups filtered out)
--   * batched newest-800 across every group_id: 1.4 ms (seq scan + sort, 378 rows)
-- The 6–14 s group list was HTTP fan-out (about 98 Supabase calls), not this
-- scan. This index does not change that. It keeps "latest message in this
-- group" and "messages since timestamp" as an index seek once group_messages
-- grows past a few thousand rows. DM and server_messages already have
-- (participants/channel_id, created_at DESC) composites.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_messages_group_created
  ON public.group_messages (group_id, created_at DESC);
