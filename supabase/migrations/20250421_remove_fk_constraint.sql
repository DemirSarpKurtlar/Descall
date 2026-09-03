-- ============================================
-- FOREIGN KEY CONSTRAINT KALDIRMA
-- user_id users tablosunda olmasa bile feedback kaydedilsin
-- ============================================

-- 1. Foreign key constraint'i kaldır
ALTER TABLE user_feedback DROP CONSTRAINT IF EXISTS user_feedback_user_id_fkey;

-- 2. user_id sütununu UUID'den text'e çevir (daha esnek)
ALTER TABLE user_feedback ALTER COLUMN user_id TYPE TEXT;

-- 3. İndex'i yeniden oluştur
DROP INDEX IF EXISTS idx_user_feedback_user_id;
CREATE INDEX idx_user_feedback_user_id ON user_feedback(user_id);

-- 4. Test et
SELECT 'Foreign key constraint removed. user_id now accepts any value.' as status;
