-- Daily News table for Gavelogy
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS daily_news (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  date           DATE        NOT NULL,
  title          TEXT        NOT NULL,
  content_custom TEXT,                         -- raw [tag] format — source of truth for editing
  content_html   TEXT,                         -- derived HTML via customToHtml() — for display
  summary        TEXT,
  keywords       TEXT[]      DEFAULT '{}',
  category       TEXT,
  source_paper   TEXT,
  status         TEXT        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'published')),
  display_order  INTEGER     NOT NULL DEFAULT 0,
  page_image     TEXT,                         -- base64 JPEG data URL of the newspaper page screenshot
  -- Gavelogy 7-field legal note structure (added in v2)
  subject        TEXT,
  topic          TEXT,
  court          TEXT,
  priority       TEXT        CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  exam_probability TEXT,
  capsule        TEXT,
  facts          JSONB,
  provisions     JSONB,
  holdings       JSONB,
  doctrine       JSONB,
  mcqs           JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── MIGRATION: run this if your table already exists without the v2 columns ──
-- (safe to run multiple times — IF NOT EXISTS / DO NOTHING)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='subject') THEN
    ALTER TABLE daily_news ADD COLUMN subject TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='topic') THEN
    ALTER TABLE daily_news ADD COLUMN topic TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='court') THEN
    ALTER TABLE daily_news ADD COLUMN court TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='priority') THEN
    ALTER TABLE daily_news ADD COLUMN priority TEXT CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='exam_probability') THEN
    ALTER TABLE daily_news ADD COLUMN exam_probability TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='capsule') THEN
    ALTER TABLE daily_news ADD COLUMN capsule TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='facts') THEN
    ALTER TABLE daily_news ADD COLUMN facts JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='provisions') THEN
    ALTER TABLE daily_news ADD COLUMN provisions JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='holdings') THEN
    ALTER TABLE daily_news ADD COLUMN holdings JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='doctrine') THEN
    ALTER TABLE daily_news ADD COLUMN doctrine JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_news' AND column_name='mcqs') THEN
    ALTER TABLE daily_news ADD COLUMN mcqs JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_daily_news_date   ON daily_news (date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_news_status ON daily_news (status);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_daily_news_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_news_updated_at ON daily_news;
CREATE TRIGGER daily_news_updated_at
  BEFORE UPDATE ON daily_news
  FOR EACH ROW EXECUTE FUNCTION update_daily_news_updated_at();

-- RLS — authenticated users can do everything (admins only access this site)
ALTER TABLE daily_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access" ON daily_news;
CREATE POLICY "Authenticated users full access" ON daily_news
  FOR ALL USING (auth.role() = 'authenticated');

-- Allow public SELECT for published articles (user site reads these)
DROP POLICY IF EXISTS "Public can read published" ON daily_news;
CREATE POLICY "Public can read published" ON daily_news
  FOR SELECT USING (status = 'published');
