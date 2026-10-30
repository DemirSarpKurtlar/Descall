-- Yetkili yöneticiler (3.3.0, owner rule: "moderatör yok, yetkili yöneticiler").
-- The sections of the Yönetici Paneli each admin may open, edited only by the
-- owner account (username "admin" / is_super_admin) in Yönetici Paneli › Yöneticiler.
-- NULL = every section (admins from before 3.3.0 keep their access until the
-- owner narrows it). Section ids: backend/lib/adminPermissions.js GRANTABLE_SECTIONS.
-- Backend-only (service role); never selected into a non-admin payload. Safe to re-run.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_permissions text[];

COMMENT ON COLUMN public.users.admin_permissions IS
  'Yönetici Paneli sections this admin may open; NULL = all. Owner-only edit.';
