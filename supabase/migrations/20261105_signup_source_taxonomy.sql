-- Granular signup source (group -> sub-source) + client platform.
-- Purely additive: new nullable columns and an index. No data is rewritten;
-- old rows are reclassified at read time from the existing first_touch_* data.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_source_group TEXT,
  ADD COLUMN IF NOT EXISTS signup_source_sub TEXT,
  ADD COLUMN IF NOT EXISTS signup_source_detail TEXT,
  ADD COLUMN IF NOT EXISTS signup_platform TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_utm_source TEXT;

CREATE INDEX IF NOT EXISTS users_signup_source_group_idx
  ON public.users (signup_source_group);
