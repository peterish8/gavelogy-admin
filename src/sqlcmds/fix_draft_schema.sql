-- FIX DRAFT SCHEMA & POLICIES
-- Run this in the Supabase SQL Editor to reset the draft table and ensure permissions are correct.

-- 1. Drop existing table to ensure clean state (WARNING: clears current drafts)
DROP TABLE IF EXISTS draft_content_cache;

-- 2. Re-create table with correct constraints
CREATE TABLE draft_content_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    original_content_id UUID NOT NULL UNIQUE, -- Essential for upsert to work
    draft_data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID DEFAULT auth.uid()
);

-- 3. Enable RLS
ALTER TABLE draft_content_cache ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Allow everything for authenticated users for now)
-- Policy for inserting/updating
CREATE POLICY "Enable all access for authenticated users" 
ON draft_content_cache 
FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');

-- Policy for anonymous users (if you are developing without login sometimes)
-- Uncomment if needed:
-- CREATE POLICY "Enable all access for anon" 
-- ON draft_content_cache 
-- FOR ALL 
-- USING (true) 
-- WITH CHECK (true);

-- 5. Grant permissions
GRANT ALL ON draft_content_cache TO authenticated;
GRANT ALL ON draft_content_cache TO service_role;
-- GRANT ALL ON draft_content_cache TO anon; -- Uncomment if using anon

-- Verify table existence
select * from draft_content_cache limit 1;
