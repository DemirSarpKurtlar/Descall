-- Özel rozet metinleri (3.1.0, owner request 30 Oct 2026):
--   demironayli: "Demir Onaylı" -> "Admin Onaylı"
--   yilbasi26:   "Yılbaşı '26" (31 Aralık 2025) -> "Yılbaşı '27" (31 Aralık 2026)
-- Ids stay the same, so holders, serial numbers, promo codes and audit rows are untouched.
-- The apps read names from the locale files first; this keeps the catalog fallback
-- (admin panel, promo previews) in step. Safe to re-run.
UPDATE public.special_badges
   SET name = 'Admin Onaylı', description = 'Yöneticinin elle onayladığı hesaplar.'
 WHERE id = 'demironayli';

UPDATE public.special_badges
   SET name = 'Yılbaşı ''27', description = '31 Aralık 2026 gecesi çevrimiçi olanlar.'
 WHERE id = 'yilbasi26';
