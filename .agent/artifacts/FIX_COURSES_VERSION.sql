-- Run this in your Supabase SQL Editor to fix the "missing version column" error
-- without deleting your existing data.

ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- If you also want to make sure your structure_items are robust (though not strictly required yet):
-- ALTER TABLE structure_items ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
