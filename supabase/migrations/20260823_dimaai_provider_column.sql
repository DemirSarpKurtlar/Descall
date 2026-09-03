-- Multi-provider key pool (gemini | groq)
ALTER TABLE public.dimaai_provider_keys
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'gemini';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dimaai_provider_keys_provider_check'
  ) THEN
    ALTER TABLE public.dimaai_provider_keys
      ADD CONSTRAINT dimaai_provider_keys_provider_check
      CHECK (provider IN ('gemini', 'groq'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dimaai_provider_keys_provider
  ON public.dimaai_provider_keys (provider, enabled DESC, failover_order ASC);
