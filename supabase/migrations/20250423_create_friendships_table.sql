-- Create friendships table for persistent friend relationships
CREATE TABLE IF NOT EXISTS friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'accepted', -- 'accepted', 'blocked'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Enable RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Users can view their own friendships
CREATE POLICY "Users can view own friendships" ON friendships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own friendships (when adding a friend)
CREATE POLICY "Users can create own friendships" ON friendships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own friendships (when removing a friend)
CREATE POLICY "Users can delete own friendships" ON friendships
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create reverse index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);

-- Create function to get mutual friendships (friendship is mutual)
CREATE OR REPLACE FUNCTION get_user_friends(p_user_id UUID)
RETURNS TABLE (
  friend_id UUID,
  username TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.friend_id,
    u.username,
    f.created_at
  FROM friendships f
  JOIN users u ON u.id = f.friend_id
  WHERE f.user_id = p_user_id AND f.status = 'accepted'
  UNION
  SELECT 
    f.user_id,
    u.username,
    f.created_at
  FROM friendships f
  JOIN users u ON u.id = f.user_id
  WHERE f.friend_id = p_user_id AND f.status = 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
