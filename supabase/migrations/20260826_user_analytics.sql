-- Product analytics: lifecycle columns + compact event tables.
-- Service-role only (RLS on, no policies). Never required for signup success.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_device TEXT,
  ADD COLUMN IF NOT EXISTS signup_browser TEXT,
  ADD COLUMN IF NOT EXISTS signup_os TEXT,
  ADD COLUMN IF NOT EXISTS signup_country TEXT,
  ADD COLUMN IF NOT EXISTS first_app_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signup_visitor_key TEXT,
  ADD COLUMN IF NOT EXISTS suspicious_signup BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  visitor_key TEXT,
  event TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  props JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_user_once_idx
  ON public.analytics_events (user_id, event)
  WHERE user_id IS NOT NULL AND event IN (
    'signup_completed',
    'app_opened',
    'first_action',
    'first_message',
    'profile_created',
    'first_session'
  );

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_visitor_signup_started_idx
  ON public.analytics_events (visitor_key, event)
  WHERE user_id IS NULL AND visitor_key IS NOT NULL AND event = 'signup_started';

CREATE INDEX IF NOT EXISTS analytics_events_event_time_idx
  ON public.analytics_events (event, occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_user_time_idx
  ON public.analytics_events (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_visitor_days (
  visitor_key TEXT NOT NULL,
  day DATE NOT NULL,
  first_touch_source TEXT,
  has_gclid BOOLEAN NOT NULL DEFAULT false,
  country TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_key, day)
);

CREATE INDEX IF NOT EXISTS analytics_visitor_days_day_idx
  ON public.analytics_visitor_days (day DESC);

CREATE INDEX IF NOT EXISTS users_signup_visitor_key_idx
  ON public.users (signup_visitor_key)
  WHERE signup_visitor_key IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_visitor_days ENABLE ROW LEVEL SECURITY;
