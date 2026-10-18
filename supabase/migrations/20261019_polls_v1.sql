-- 2.12.0: votable polls (/poll v2). Additive only: three new tables and three
-- functions. Nothing existing is altered or dropped.
--
-- A poll belongs to exactly one chat message (server, group or 1:1 DM) and is
-- removed with it (ON DELETE CASCADE, so /purge and message delete clean up).
-- Scope columns (server_id/channel_id, group_id, dm_user_lo/hi) are copied from
-- the message so access checks never trust a client id.
--
-- The API talks to Postgres with the service role only: RLS is on, anon and
-- authenticated have no grants, there are no policies. Votes of members who
-- later leave a server stay counted (rows are only removed with the account).

CREATE TABLE IF NOT EXISTS public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('server', 'group', 'dm')),
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.server_channels(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  dm_user_lo uuid,
  dm_user_hi uuid,
  server_message_id uuid UNIQUE REFERENCES public.server_messages(id) ON DELETE CASCADE,
  group_message_id uuid UNIQUE REFERENCES public.group_messages(id) ON DELETE CASCADE,
  dm_message_id uuid UNIQUE REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 300),
  allow_multiselect boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT false,
  ends_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  close_reason text CHECK (close_reason IN ('creator', 'moderator', 'expired')),
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT polls_one_message CHECK (num_nonnulls(server_message_id, group_message_id, dm_message_id) = 1),
  CONSTRAINT polls_scope_fields CHECK (
    (scope = 'server' AND server_id IS NOT NULL AND channel_id IS NOT NULL AND server_message_id IS NOT NULL)
    OR (scope = 'group' AND group_id IS NOT NULL AND group_message_id IS NOT NULL)
    OR (scope = 'dm' AND dm_user_lo IS NOT NULL AND dm_user_hi IS NOT NULL AND dm_message_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_polls_open_ends_at ON public.polls (ends_at) WHERE closed_at IS NULL AND ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_polls_channel ON public.polls (channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_polls_group ON public.polls (group_id) WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 9),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 100),
  emoji text CHECK (emoji IS NULL OR char_length(emoji) <= 16),
  UNIQUE (poll_id, position)
);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options (poll_id);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, option_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_user ON public.poll_votes (poll_id, user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON public.poll_votes (option_id, created_at DESC);

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.polls, public.poll_options, public.poll_votes FROM anon, authenticated;

-- Replaces the caller's votes on one poll atomically. Empty array = remove the vote.
-- Raises POLL_NOT_FOUND / POLL_CLOSED / SINGLE_CHOICE / BAD_OPTION.
CREATE OR REPLACE FUNCTION public.poll_cast_vote(p_poll_id uuid, p_user_id uuid, p_option_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.polls%ROWTYPE;
  wanted uuid[] := COALESCE((SELECT array_agg(DISTINCT x) FROM unnest(p_option_ids) AS x WHERE x IS NOT NULL), '{}');
  valid_count integer;
  voters integer;
BEGIN
  SELECT * INTO p FROM public.polls WHERE id = p_poll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POLL_NOT_FOUND'; END IF;
  IF p.closed_at IS NOT NULL OR (p.ends_at IS NOT NULL AND p.ends_at <= now()) THEN
    RAISE EXCEPTION 'POLL_CLOSED';
  END IF;
  IF NOT p.allow_multiselect AND cardinality(wanted) > 1 THEN RAISE EXCEPTION 'SINGLE_CHOICE'; END IF;
  SELECT count(*) INTO valid_count FROM public.poll_options WHERE poll_id = p_poll_id AND id = ANY (wanted);
  IF valid_count <> cardinality(wanted) THEN RAISE EXCEPTION 'BAD_OPTION'; END IF;

  DELETE FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = p_user_id AND NOT (option_id = ANY (wanted));
  INSERT INTO public.poll_votes (poll_id, option_id, user_id)
    SELECT p_poll_id, x, p_user_id FROM unnest(wanted) AS x
    ON CONFLICT DO NOTHING;
  UPDATE public.polls SET version = version + 1, updated_at = now() WHERE id = p_poll_id;
  SELECT count(DISTINCT user_id) INTO voters FROM public.poll_votes WHERE poll_id = p_poll_id;
  RETURN jsonb_build_object('version', p.version + 1, 'voters', voters, 'mine', to_jsonb(wanted));
END;
$$;

-- Per-poll tally for a viewer: option counts, distinct voters, the viewer's own choices.
CREATE OR REPLACE FUNCTION public.poll_tally(p_poll_ids uuid[], p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(pid, jsonb_build_object(
    'counts', COALESCE((SELECT jsonb_object_agg(option_id, n) FROM (
        SELECT option_id, count(*) AS n FROM public.poll_votes WHERE poll_id = pid GROUP BY option_id) c), '{}'::jsonb),
    'voters', (SELECT count(DISTINCT user_id) FROM public.poll_votes WHERE poll_id = pid),
    'mine', COALESCE((SELECT jsonb_agg(option_id) FROM public.poll_votes WHERE poll_id = pid AND user_id = p_user_id), '[]'::jsonb)
  )), '{}'::jsonb)
  FROM unnest(p_poll_ids) AS pid;
$$;

-- Creator edit, allowed only while the poll is open and has no votes at all.
-- p_options: [{"text": "...", "emoji": "..."}], 2..10 items. Raises POLL_NOT_FOUND /
-- NOT_CREATOR / POLL_CLOSED / HAS_VOTES / BAD_OPTIONS.
CREATE OR REPLACE FUNCTION public.poll_edit(p_poll_id uuid, p_user_id uuid, p_question text, p_options jsonb, p_allow_multiselect boolean, p_anonymous boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.polls%ROWTYPE;
  n integer := COALESCE(jsonb_array_length(p_options), 0);
BEGIN
  SELECT * INTO p FROM public.polls WHERE id = p_poll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POLL_NOT_FOUND'; END IF;
  IF p.creator_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'NOT_CREATOR'; END IF;
  IF p.closed_at IS NOT NULL OR (p.ends_at IS NOT NULL AND p.ends_at <= now()) THEN RAISE EXCEPTION 'POLL_CLOSED'; END IF;
  IF EXISTS (SELECT 1 FROM public.poll_votes WHERE poll_id = p_poll_id) THEN RAISE EXCEPTION 'HAS_VOTES'; END IF;
  IF n < 2 OR n > 10 THEN RAISE EXCEPTION 'BAD_OPTIONS'; END IF;

  DELETE FROM public.poll_options WHERE poll_id = p_poll_id;
  INSERT INTO public.poll_options (poll_id, position, text, emoji)
    SELECT p_poll_id, (o.ord - 1)::smallint, o.val->>'text', NULLIF(o.val->>'emoji', '')
    FROM jsonb_array_elements(p_options) WITH ORDINALITY AS o(val, ord);
  UPDATE public.polls
     SET question = p_question,
         allow_multiselect = COALESCE(p_allow_multiselect, allow_multiselect),
         anonymous = COALESCE(p_anonymous, anonymous),
         version = version + 1,
         updated_at = now()
   WHERE id = p_poll_id;
  RETURN jsonb_build_object('version', p.version + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.poll_cast_vote(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poll_tally(uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poll_edit(uuid, uuid, text, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poll_cast_vote(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.poll_tally(uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poll_edit(uuid, uuid, text, jsonb, boolean, boolean) TO service_role;
