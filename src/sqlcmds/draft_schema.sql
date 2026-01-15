-- Create Draft Content Cache Table
-- This table stores temporary autosaved work for course items
CREATE TABLE IF NOT EXISTS draft_content_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    original_content_id UUID NOT NULL UNIQUE, -- Links to the course item ID
    draft_data JSONB, -- Stores { content_html: "..." }
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID DEFAULT auth.uid()
);

-- Note: Ensure Row Level Security (RLS) is enabled if needed
-- ALTER TABLE draft_content_cache ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable all access for authenticated users" ON draft_content_cache FOR ALL USING (auth.role() = 'authenticated');

-- Create Live Note Contents Table (if not exists)
CREATE TABLE IF NOT EXISTS note_contents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL UNIQUE,
    content_html TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
