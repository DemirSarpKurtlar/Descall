-- ============================================
-- TABLO KONTROLÜ VE DÜZELTME
-- ============================================

-- 1. Tablo var mı kontrol et
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'user_feedback';

-- 2. Sütunları kontrol et
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'user_feedback' 
ORDER BY ordinal_position;

-- 3. Tablo boşsa test verisi ekle (manuel test için)
-- Bu çalışırsa frontend de çalışmalı
INSERT INTO user_feedback (
  user_id,
  username,
  category,
  priority,
  message,
  attachments,
  status
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'test_user',
  'bug',
  'high',
  'Test message from SQL',
  '["https://example.com/test.png"]',
  'new'
)
ON CONFLICT DO NOTHING
RETURNING *;

-- 4. Verileri kontrol et
SELECT * FROM user_feedback ORDER BY created_at DESC LIMIT 5;

-- 5. Eğer tablo yoksa oluştur (yeniden)
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'new',
  viewed BOOLEAN DEFAULT false,
  viewed_at TIMESTAMPTZ,
  admin_replies JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS'yi kapat (test için)
ALTER TABLE IF EXISTS user_feedback DISABLE ROW LEVEL SECURITY;
