-- Special badge #37: KK22 (owner request 6 Nov 2026).
--
-- Tekil like #001: one live holder at a time (max_holders = 1). Admin only: given by hand
-- from the admin panel, never through a promo code. The art (mirrored K monogram over "22"
-- in its own red-black frame) lives in frontend/src/components/badges/specialBadgeArt.jsx.
--
-- Additive and idempotent: one catalog row; re-running refreshes its copy and rules and
-- never touches holders.
INSERT INTO public.special_badges (id, no, name, tier, description, grant_mode, max_holders) VALUES
  ('kk22', 37, 'KK22', 'tekil', 'Yalnızca bir kişide olabilir. Bilen bilir.', 'admin_only', 1)
ON CONFLICT (id) DO UPDATE SET
  no = EXCLUDED.no, name = EXCLUDED.name, tier = EXCLUDED.tier, description = EXCLUDED.description,
  grant_mode = EXCLUDED.grant_mode, max_holders = EXCLUDED.max_holders;
