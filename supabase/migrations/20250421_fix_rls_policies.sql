-- ============================================
-- FIX RLS POLICIES FOR USER_FEEDBACK
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own feedback" ON user_feedback;
DROP POLICY IF EXISTS "Users can create feedback" ON user_feedback;
DROP POLICY IF EXISTS "Admin can view all feedback" ON user_feedback;

-- Disable RLS temporarily to test (REMOVE THIS IN PRODUCTION!)
ALTER TABLE user_feedback DISABLE ROW LEVEL SECURITY;

-- Or use this more permissive policy for authenticated users:
-- ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- -- Allow authenticated users to insert their own feedback
-- CREATE POLICY "Enable insert for authenticated users" ON user_feedback
--   FOR INSERT TO authenticated 
--   WITH CHECK (true);

-- -- Allow authenticated users to select their own feedback
-- CREATE POLICY "Enable select for own feedback" ON user_feedback
--   FOR SELECT TO authenticated 
--   USING (user_id = auth.uid());

-- -- Allow admin to see all (if you have an is_admin() function)
-- CREATE POLICY "Enable admin full access" ON user_feedback
--   FOR ALL TO authenticated 
--   USING (is_admin(auth.uid()));

-- ============================================
-- CHECK IF TABLE EXISTS AND HAS DATA
-- ============================================

-- Check table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'user_feedback';

-- Check if table is empty
SELECT COUNT(*) as total_feedbacks FROM user_feedback;

-- Show all feedbacks (if any)
SELECT * FROM user_feedback ORDER BY created_at DESC LIMIT 10;
