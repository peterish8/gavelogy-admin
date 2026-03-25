-- =====================================================
-- PYQ Enrichment Migration
-- Run this in Supabase SQL editor
-- Safe to run multiple times (all IF NOT EXISTS / IF EXISTS guards)
-- =====================================================

-- Step 1: Create pyq_passages table if it does not exist yet
-- (It may be missing if the old single-table schema was used)
CREATE TABLE IF NOT EXISTS pyq_passages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id       UUID        NOT NULL REFERENCES pyq_tests(id) ON DELETE CASCADE,
  order_index   INTEGER     NOT NULL DEFAULT 0,
  passage_text  TEXT        NOT NULL,
  citation      TEXT,
  section_number TEXT,
  subject       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pyq_passages_test_order ON pyq_passages(test_id, order_index);

-- RLS
ALTER TABLE pyq_passages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pyq_passages' AND policyname = 'Admins full access pyq_passages'
  ) THEN
    CREATE POLICY "Admins full access pyq_passages"
      ON pyq_passages FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Step 2: Add passage_id FK to pyq_questions if not already present
-- (needed when migrating from old inline-passage schema)
ALTER TABLE pyq_questions
  ADD COLUMN IF NOT EXISTS passage_id UUID REFERENCES pyq_passages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pyq_questions_passage ON pyq_questions(passage_id);

-- Step 3: Add CLAT PG enrichment columns to pyq_questions
ALTER TABLE pyq_questions
  ADD COLUMN IF NOT EXISTS subject       TEXT,
  ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'mcq';

-- Step 4: Add enrichment columns to pyq_passages
-- (citation & section_number already added in CREATE TABLE above,
--  but ADD COLUMN IF NOT EXISTS is safe if the table already existed without them)
ALTER TABLE pyq_passages
  ADD COLUMN IF NOT EXISTS citation       TEXT,
  ADD COLUMN IF NOT EXISTS section_number TEXT,
  ADD COLUMN IF NOT EXISTS subject        TEXT;
