-- Create announcement_reads table to track read status
CREATE TABLE IF NOT EXISTS announcement_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, announcement_id)
);

-- Enable RLS
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

-- Users can only view their own reads
CREATE POLICY "Users can view own reads" ON announcement_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can only insert their own reads
CREATE POLICY "Users can insert own reads" ON announcement_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can only delete their own reads
CREATE POLICY "Users can delete own reads" ON announcement_reads
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON announcement_reads(announcement_id);
