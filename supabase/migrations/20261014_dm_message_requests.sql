-- Pending DMs from people who are not friends. The API uses the service
-- role. anon and authenticated keep no grants (see 20261010_lock_anon_table_access).

CREATE TABLE IF NOT EXISTS public.dm_message_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  from_username TEXT,
  from_avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_message_requests_to
  ON public.dm_message_requests (to_user_id, created_at DESC);

ALTER TABLE public.dm_message_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dm_message_requests FROM anon, authenticated;
