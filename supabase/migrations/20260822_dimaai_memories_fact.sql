-- Align live dimaai_memories with DimaAI 1.1 code (column "fact").
-- Older schema used "memory"; CREATE TABLE IF NOT EXISTS skipped the fix.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dimaai_memories' AND column_name = 'memory'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dimaai_memories' AND column_name = 'fact'
  ) THEN
    ALTER TABLE public.dimaai_memories RENAME COLUMN memory TO fact;
  END IF;
END $$;

ALTER TABLE public.dimaai_memories
  ADD COLUMN IF NOT EXISTS fact TEXT;

UPDATE public.dimaai_memories SET fact = COALESCE(fact, '') WHERE fact IS NULL;
ALTER TABLE public.dimaai_memories ALTER COLUMN fact SET DEFAULT '';
ALTER TABLE public.dimaai_memories ALTER COLUMN fact SET NOT NULL;
