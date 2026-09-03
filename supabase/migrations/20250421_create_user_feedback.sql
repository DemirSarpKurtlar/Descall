-- ============================================
-- USER FEEDBACK SYSTEM
-- ============================================

-- Drop existing table if exists (for clean setup)
DROP TABLE IF EXISTS user_feedback CASCADE;

-- Create user_feedback table
CREATE TABLE user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'improvement', 'security', 'other')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  viewed BOOLEAN DEFAULT false,
  viewed_at TIMESTAMPTZ,
  admin_replies JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_user_feedback_status ON user_feedback(status);
CREATE INDEX idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX idx_user_feedback_category ON user_feedback(category);
CREATE INDEX idx_user_feedback_priority ON user_feedback(priority);
CREATE INDEX idx_user_feedback_viewed ON user_feedback(viewed);

-- Enable RLS
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own feedback
CREATE POLICY "Users can view own feedback" ON user_feedback
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can create their own feedback
CREATE POLICY "Users can create feedback" ON user_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Admin can view all feedback
-- Note: This requires an is_admin() function or checking user metadata
CREATE POLICY "Admin can view all feedback" ON user_feedback
  FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'admin' 
      OR email LIKE '%admin%'
    )
  );

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_user_feedback_updated_at 
  BEFORE UPDATE ON user_feedback 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- EXAMPLE QUERIES FOR ADMIN PANEL
-- ============================================

-- Get all feedback with filters (for admin)
-- SELECT * FROM user_feedback 
-- WHERE status = 'new' 
-- ORDER BY created_at DESC;

-- Get feedback stats
-- SELECT 
--   status, COUNT(*) as count 
-- FROM user_feedback 
-- GROUP BY status;

-- Get new/unviewed count
-- SELECT COUNT(*) FROM user_feedback 
-- WHERE status = 'new' AND viewed = false;

-- ============================================
-- SEED DATA (Optional - for testing)
-- ============================================

-- Insert test feedback (replace with actual user_id)
-- INSERT INTO user_feedback (user_id, username, category, priority, message, attachments, status)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',
--   'testuser',
--   'bug',
--   'high',
--   'Test feedback message',
--   '["https://example.com/image.png"]',
--   'new'
-- );
