-- Apple Watch games (owner request, Nov 2026): admin only, on the watch only.
--
-- admin_watch_game_scores: the best result an admin reached per game and mode on the
--   Apple Watch, plus how many rounds were played there. The watch keeps the same numbers
--   locally; this copy brings them back on a new or reset watch.
--   game / mode: the catalog of frontend/backend/lib/watchGames.js (e.g. 'chess' / 'hard',
--   'merge' / ''). best: points, wins or seconds, depending on the game (lower is better
--   for 'mines' and 'sudoku', where 0 means not finished yet). Points only: never money,
--   never DesCoin.
--
-- Only the backend reads and writes it with the service role (routes/adminWatchGames.js,
-- behind the admin session, admin 2FA and the section check): RLS on, no policies, no
-- anon / authenticated grants. Additive, safe to re-run. Until it is applied the watch
-- keeps its local bests and the API answers storage "unavailable".

CREATE TABLE IF NOT EXISTS public.admin_watch_game_scores (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  game text NOT NULL CHECK (game ~ '^[a-z]{2,16}$'),
  mode text NOT NULL DEFAULT '' CHECK (mode ~ '^[a-z]{0,16}$'),
  best bigint NOT NULL DEFAULT 0 CHECK (best >= 0),
  plays integer NOT NULL DEFAULT 0 CHECK (plays >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game, mode)
);

ALTER TABLE public.admin_watch_game_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_watch_game_scores FROM anon, authenticated;
