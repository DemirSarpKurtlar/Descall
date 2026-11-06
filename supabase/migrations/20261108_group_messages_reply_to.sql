-- Messaging phase 4: forwarded group messages (and group reply quotes) keep their
-- mark in history. Additive only.
--
-- dm_messages and server_messages already have reply_to (20260806, 20260812);
-- group messages only carried it in the live socket echo, so a reply quote or
-- the "Iletildi" mark disappeared after a reload. The forward mark is stored as
-- reply_to = {"forwarded": true} (backend/lib/forwardedMessage.js).
-- The backend works before this runs: inserts retry without the column and
-- history skips it.

alter table public.group_messages
  add column if not exists reply_to jsonb;
