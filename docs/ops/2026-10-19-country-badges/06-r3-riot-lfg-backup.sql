-- R3 (Demir onayı, 19.10.2026): Riot/LFG tablolarını ops_backup'a kopyala, sonra kod bunları kullanmaz.
-- DROP YOK. Silme tarihi: 18.11.2026 (30 gün) - ayrı adımda, 07-r3-drop-after-2026-11-18.sql.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ops_backup;
REVOKE ALL ON SCHEMA ops_backup FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS ops_backup.b20261019_user_riot_accounts AS TABLE public.user_riot_accounts;
CREATE TABLE IF NOT EXISTS ops_backup.b20261019_lfg_lobbies AS TABLE public.lfg_lobbies;
CREATE TABLE IF NOT EXISTS ops_backup.b20261019_lfg_lobby_members AS TABLE public.lfg_lobby_members;
CREATE TABLE IF NOT EXISTS ops_backup.b20261019_lfg_reports AS TABLE public.lfg_reports;
REVOKE ALL ON ALL TABLES IN SCHEMA ops_backup FROM anon, authenticated;
COMMENT ON TABLE ops_backup.b20261019_user_riot_accounts IS 'R3 backup 2026-10-19; delete after 2026-11-18 with owner approval';
COMMENT ON TABLE ops_backup.b20261019_lfg_lobbies IS 'R3 backup 2026-10-19; delete after 2026-11-18 with owner approval';
COMMENT ON TABLE ops_backup.b20261019_lfg_lobby_members IS 'R3 backup 2026-10-19; delete after 2026-11-18 with owner approval';
COMMENT ON TABLE ops_backup.b20261019_lfg_reports IS 'R3 backup 2026-10-19; delete after 2026-11-18 with owner approval';
SELECT json_build_object(
  'ura', (SELECT count(*) FROM public.user_riot_accounts), 'ura_bk', (SELECT count(*) FROM ops_backup.b20261019_user_riot_accounts),
  'lobbies', (SELECT count(*) FROM public.lfg_lobbies), 'lobbies_bk', (SELECT count(*) FROM ops_backup.b20261019_lfg_lobbies),
  'members', (SELECT count(*) FROM public.lfg_lobby_members), 'members_bk', (SELECT count(*) FROM ops_backup.b20261019_lfg_lobby_members),
  'reports', (SELECT count(*) FROM public.lfg_reports), 'reports_bk', (SELECT count(*) FROM ops_backup.b20261019_lfg_reports)) AS r;
COMMIT;
