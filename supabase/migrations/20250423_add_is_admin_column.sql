-- Add is_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Update admin user to have is_admin = true
UPDATE users SET is_admin = TRUE WHERE username = 'admin';
