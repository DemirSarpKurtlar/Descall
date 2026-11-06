-- Messaging phase 5: one attachment on a scheduled message. Additive only.
--
-- The app uploads the file through the normal /api/media/upload
-- (purpose=message, same type and size limits) when you schedule. The row
-- keeps the stored private ref and the upload's details; the sender
-- (backend/lib/scheduledMessages.js) sends it with the message. When the row
-- is cancelled or fails, the stored upload is deleted unless a sent message
-- or another pending row uses the same file.
-- A row with an attachment and no caption stores content ' ' (the existing
-- content check needs one character).
-- Before this runs, scheduling with an attachment answers 503
-- attach_not_ready; text-only scheduling works as before.

alter table public.scheduled_messages
  add column if not exists media_ref text
    check (media_ref is null or media_ref like 'sb://media-private/%'),
  add column if not exists media_type text
    check (media_type is null or media_type in ('image', 'video', 'document', 'file')),
  add column if not exists mime_type text,
  add column if not exists file_size bigint
    check (file_size is null or file_size between 0 and 104857600),
  add column if not exists original_name text
    check (original_name is null or char_length(original_name) <= 1024);

-- "Is this stored file still used by another pending schedule?" on cancel / failure.
create index if not exists scheduled_messages_media_ref_idx
  on public.scheduled_messages (media_ref)
  where media_ref is not null;
