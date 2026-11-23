-- Inventory "Stüdyo" (22 Nov 2026): saved looks can be pinned ("Sabitle"). Additive only: one
-- nullable column on shop2_outfits (null = not pinned). RLS and grants stay as set by
-- 20261115_shop2.sql (service role only). The backend keeps pins in memory until this is applied.
ALTER TABLE public.shop2_outfits ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
