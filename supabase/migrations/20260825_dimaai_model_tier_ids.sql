-- Dima 1.1+ public tier ids. Keep legacy auto/fast/smart so existing rows still validate.

ALTER TABLE public.dimaai_conversations
  DROP CONSTRAINT IF EXISTS dimaai_conversations_model_tier_check;

ALTER TABLE public.dimaai_conversations
  ADD CONSTRAINT dimaai_conversations_model_tier_check
  CHECK (model_tier IN (
    'auto', 'fast', 'smart',
    'dima_1_1_fast', 'dima_1_1_turbo',
    'dima_1_2_thinking', 'dima_1_2_pro',
    'dima_1_3_deep'
  ));

ALTER TABLE public.dimaai_conversations
  ALTER COLUMN model_tier SET DEFAULT 'dima_1_1_fast';

ALTER TABLE public.dimaai_user_settings
  DROP CONSTRAINT IF EXISTS dimaai_user_settings_model_tier_check;

ALTER TABLE public.dimaai_user_settings
  ADD CONSTRAINT dimaai_user_settings_model_tier_check
  CHECK (model_tier IN (
    'auto', 'fast', 'smart',
    'dima_1_1_fast', 'dima_1_1_turbo',
    'dima_1_2_thinking', 'dima_1_2_pro',
    'dima_1_3_deep'
  ));

ALTER TABLE public.dimaai_user_settings
  ALTER COLUMN model_tier SET DEFAULT 'dima_1_1_fast';
