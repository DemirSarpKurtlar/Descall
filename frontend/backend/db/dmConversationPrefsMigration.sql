-- Per-user DM list prefs: pin, mute, hide (close), mark-unread.
-- Applied to Supabase via MCP; kept here for local reference.

CREATE TABLE IF NOT EXISTS public.dm_conversation_prefs (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  peer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  marked_unread BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, peer_id),
  CONSTRAINT dm_conversation_prefs_not_self CHECK (user_id <> peer_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_prefs_user_pinned
  ON public.dm_conversation_prefs (user_id) WHERE pinned;
CREATE INDEX IF NOT EXISTS idx_dm_prefs_user_hidden
  ON public.dm_conversation_prefs (user_id) WHERE hidden;
CREATE INDEX IF NOT EXISTS idx_dm_prefs_user_muted
  ON public.dm_conversation_prefs (user_id) WHERE muted;

ALTER TABLE public.dm_conversation_prefs ENABLE ROW LEVEL SECURITY;
