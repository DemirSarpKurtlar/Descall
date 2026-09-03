-- Admin voice-chat archive: client-captured sessions stored as MP3 in the media bucket.
-- Backend uses the service role. RLS on with no anon/authenticated policies.

CREATE TABLE IF NOT EXISTS public.voice_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'group', 'server')),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'failed')),
  title TEXT,
  description TEXT,
  dm_peer_ids UUID[],
  group_id UUID,
  group_name TEXT,
  server_id UUID,
  server_name TEXT,
  channel_id UUID,
  channel_name TEXT,
  participant_ids UUID[],
  participant_usernames TEXT[],
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  storage_path TEXT,
  source_mime TEXT,
  byte_size BIGINT,
  livekit_egress_id TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_recordings_kind_started
  ON public.voice_recordings (kind, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_recordings_status_started
  ON public.voice_recordings (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_recordings_group_started
  ON public.voice_recordings (group_id, started_at DESC)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_recordings_channel_started
  ON public.voice_recordings (channel_id, started_at DESC)
  WHERE channel_id IS NOT NULL;

ALTER TABLE public.voice_recordings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_recordings FROM anon, authenticated;
GRANT ALL ON TABLE public.voice_recordings TO service_role;
