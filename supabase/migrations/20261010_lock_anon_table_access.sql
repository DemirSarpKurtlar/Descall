-- The API talks to Postgres with the service role only. The publishable anon
-- key (and the authenticated role) had ALL privileges on public tables.
-- Row level security was off on the server, shop, and call tables, so that
-- key could read and delete server messages, shop purchases, and inventory.
-- TRUNCATE ignores row level security, so tables that already had RLS
-- (including users) were still exposed to a wipe.
--
-- This does not change or delete rows. service_role and postgres keep their
-- grants. The service role bypasses RLS, so the backend keeps working.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

ALTER TABLE public.group_call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_channel_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_channel_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_channel_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.get_user_friends(uuid) SET search_path = public;
ALTER FUNCTION public.get_message_reactions(text) SET search_path = public;
ALTER FUNCTION public.ensure_user_credits() SET search_path = public;
ALTER FUNCTION public.yaldiz_score_rate_limit() SET search_path = public;
