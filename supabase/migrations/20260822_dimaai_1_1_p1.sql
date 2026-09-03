-- DimaAI 1.1 P1/P2: settings, memories, attachments, conversation polish.

ALTER TABLE public.dimaai_conversations
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS model_tier TEXT NOT NULL DEFAULT 'auto'
    CHECK (model_tier IN ('auto', 'fast', 'smart'));

CREATE INDEX IF NOT EXISTS idx_dimaai_conversations_user_pinned
  ON public.dimaai_conversations (user_id, is_pinned DESC, is_favorite DESC, updated_at DESC);

ALTER TABLE public.dimaai_messages
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.dimaai_user_settings (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  custom_instructions TEXT NOT NULL DEFAULT '',
  model_tier TEXT NOT NULL DEFAULT 'auto'
    CHECK (model_tier IN ('auto', 'fast', 'smart')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dimaai_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dimaai_memories_user_created
  ON public.dimaai_memories (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dimaai_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.dimaai_conversations(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL DEFAULT 'file',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'document'
    CHECK (kind IN ('image', 'document', 'text', 'csv', 'pdf', 'docx')),
  storage_path TEXT,
  public_url TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dimaai_attachments_user_created
  ON public.dimaai_attachments (user_id, created_at DESC);

ALTER TABLE public.dimaai_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dimaai_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dimaai_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dimaai_user_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.dimaai_memories FROM anon, authenticated;
REVOKE ALL ON TABLE public.dimaai_attachments FROM anon, authenticated;
GRANT ALL ON TABLE public.dimaai_user_settings TO service_role;
GRANT ALL ON TABLE public.dimaai_memories TO service_role;
GRANT ALL ON TABLE public.dimaai_attachments TO service_role;
