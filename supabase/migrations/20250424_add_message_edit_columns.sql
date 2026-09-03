-- Add edit columns to group_messages table
ALTER TABLE group_messages 
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

-- Index for edited messages
CREATE INDEX IF NOT EXISTS idx_group_messages_edited ON group_messages(is_edited) WHERE is_edited = TRUE;

-- Update RLS policies to allow editing own messages
CREATE POLICY "group_messages_update_own" ON group_messages
  FOR UPDATE
  USING (sender_id = auth.uid());
