-- 2.11.2: private bucket for DM / group / server-channel attachments.
-- Additive only. Objects are reachable solely through the backend (service role), which
-- issues short-lived signed URLs to conversation members. No RLS policy grants anon or
-- authenticated access to this bucket. Reverse: move objects back to `media`, then
-- delete from storage.buckets where id = 'media-private' (only once it is empty).
insert into storage.buckets (id, name, public, file_size_limit)
values ('media-private', 'media-private', false, 104857600)
on conflict (id) do nothing;
