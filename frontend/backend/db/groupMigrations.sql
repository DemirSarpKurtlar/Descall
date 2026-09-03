-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grup DM Sistemi Migration (15 kişi max, mesh architecture)

-- Gruplar tablosu
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Grup üyeleri (max 15 kişi kontrolü uygulama seviyesinde)
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID,
  user_id UUID,
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- Grup mesajları
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Grup davetleri/istekleri
CREATE TABLE IF NOT EXISTS group_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  invited_by UUID NOT NULL,
  invited_user_id UUID NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, accepted, declined
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (group_id, invited_user_id)
);

-- Grup sesli/görüntülü arama aktif mi (call room)
CREATE TABLE IF NOT EXISTS group_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  started_by UUID NOT NULL,
  call_type TEXT NOT NULL, -- voice, video
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- Call'a katılan üyeler (mesh signaling için)
CREATE TABLE IF NOT EXISTS group_call_participants (
  call_id UUID,
  user_id UUID,
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  PRIMARY KEY (call_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created ON group_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_group_invites_user ON group_invites(invited_user_id);

-- Row Level Security disabled for service role
ALTER TABLE groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_call_participants DISABLE ROW LEVEL SECURITY;
