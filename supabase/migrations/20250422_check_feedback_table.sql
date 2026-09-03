-- Check user_feedback table structure and fix issues

-- 1. Check if table exists and get column info
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_feedback' 
ORDER BY ordinal_position;

-- 2. Check for constraints (foreign keys, etc.)
SELECT 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'user_feedback';

-- 3. Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'user_feedback';

-- 4. Fix: Drop foreign key constraint if exists (causes issues with text user_id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_feedback_user_id_fkey' 
        AND table_name = 'user_feedback'
    ) THEN
        ALTER TABLE user_feedback DROP CONSTRAINT user_feedback_user_id_fkey;
        RAISE NOTICE 'Dropped foreign key constraint';
    END IF;
END $$;

-- 5. Fix: Change user_id to text if it's uuid (prevents FK issues)
ALTER TABLE user_feedback 
    ALTER COLUMN user_id TYPE TEXT;

-- 6. Fix: Ensure all required columns exist
DO $$
BEGIN
    -- Add status column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_feedback' AND column_name = 'status'
    ) THEN
        ALTER TABLE user_feedback ADD COLUMN status TEXT DEFAULT 'new';
    END IF;
    
    -- Add viewed column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_feedback' AND column_name = 'viewed'
    ) THEN
        ALTER TABLE user_feedback ADD COLUMN viewed BOOLEAN DEFAULT false;
    END IF;
    
    -- Add admin_replies column if missing (for JSON array)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_feedback' AND column_name = 'admin_replies'
    ) THEN
        ALTER TABLE user_feedback ADD COLUMN admin_replies JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- Add viewed_at column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_feedback' AND column_name = 'viewed_at'
    ) THEN
        ALTER TABLE user_feedback ADD COLUMN viewed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 7. Disable RLS for this table (service role key bypasses anyway, but just in case)
ALTER TABLE user_feedback DISABLE ROW LEVEL SECURITY;

-- 8. Verify the table is ready
SELECT COUNT(*) as total_feedback_count FROM user_feedback;
