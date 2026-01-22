-- ============================================
-- REAL-TIME COLLABORATION - DATABASE SETUP
-- ============================================
-- Run this in Supabase SQL Editor
-- Based on existing schema from Completesqljson.json

-- ============================================
-- STEP 1: Add columns to draft_content_cache for cursor/presence tracking
-- ============================================
-- Note: draft_content_cache already has: id, original_content_id, user_id, draft_data, updated_at

-- Add cursor_data column for tracking cursor positions (for live cursor sync)
ALTER TABLE draft_content_cache 
  ADD COLUMN IF NOT EXISTS cursor_data JSONB DEFAULT '{}';

-- Add last_active_at for tracking when admin was last active on this draft
ALTER TABLE draft_content_cache 
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_draft_content_cache_user_id 
  ON draft_content_cache(user_id);

-- Create index for active drafts
CREATE INDEX IF NOT EXISTS idx_draft_content_cache_last_active 
  ON draft_content_cache(last_active_at);

-- ============================================
-- STEP 2: Enable Supabase Realtime on required tables
-- ============================================
-- This allows clients to subscribe to changes via WebSocket

-- Enable realtime for draft_content_cache (collaborative editing)
ALTER PUBLICATION supabase_realtime ADD TABLE draft_content_cache;

-- Enable realtime for structure_items (course structure sync)
ALTER PUBLICATION supabase_realtime ADD TABLE structure_items;

-- Enable realtime for courses (course list sync)
ALTER PUBLICATION supabase_realtime ADD TABLE courses;

-- Enable realtime for note_contents (published content sync)
ALTER PUBLICATION supabase_realtime ADD TABLE note_contents;

-- ============================================
-- STEP 3: Create admin_presence table for tracking active admins
-- ============================================
-- This table tracks which admins are online and where they are

CREATE TABLE IF NOT EXISTS admin_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  admin_name TEXT,
  admin_email TEXT,
  current_page TEXT,
  current_item_id UUID,
  cursor_position JSONB DEFAULT '{}',
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable realtime for presence tracking
ALTER PUBLICATION supabase_realtime ADD TABLE admin_presence;

-- Create index for presence lookups
CREATE INDEX IF NOT EXISTS idx_admin_presence_last_seen 
  ON admin_presence(last_seen_at);

-- ============================================
-- STEP 4: RLS Policies for admin_presence
-- ============================================
ALTER TABLE admin_presence ENABLE ROW LEVEL SECURITY;

-- Admins can view all presence (to see who's online)
CREATE POLICY "Admins can view all presence" ON admin_presence
  FOR SELECT USING (true);

-- Admins can insert their own presence
CREATE POLICY "Admins can insert their own presence" ON admin_presence
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can update their own presence
CREATE POLICY "Admins can update their own presence" ON admin_presence
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can delete their own presence (on logout)
CREATE POLICY "Admins can delete their own presence" ON admin_presence
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- STEP 5: Verify setup
-- ============================================
-- Run these to confirm everything is set up correctly

-- Check if new columns exist on draft_content_cache
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'draft_content_cache';

-- Check if admin_presence table was created
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'admin_presence'
) as admin_presence_exists;

-- Check realtime publication 
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
