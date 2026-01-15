-- OPTIMIZE NOTES TABLE
-- Run this in Supabase SQL Editor to make note loading faster.

-- 1. Create Index on item_id for faster lookups
CREATE INDEX IF NOT EXISTS note_contents_item_id_idx ON note_contents (item_id);

-- 2. Create Index on original_content_id for drafts (just in case)
CREATE INDEX IF NOT EXISTS draft_content_cache_original_content_id_idx ON draft_content_cache (original_content_id);

-- 3. Analyze tables to update statistics for the query planner
ANALYZE note_contents;
ANALYZE draft_content_cache;
