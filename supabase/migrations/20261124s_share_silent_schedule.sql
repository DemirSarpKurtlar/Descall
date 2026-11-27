-- "Paylaş > Descall" (share sheet, 4.3): a scheduled share can be "Sessiz" (silent):
-- it is delivered and counted, but nobody gets a push for it.
-- Additive only. lib/scheduledMessages.js stores rows without the column (and sends
-- them with a push as before) until this migration is applied.
alter table if exists public.scheduled_messages
  add column if not exists silent boolean not null default false;
