-- =====================================================
-- PYQ (Previous Year Questions) Mock Test Tables
-- Run this in Supabase SQL editor
-- =====================================================

-- PYQ Tests (exam-level metadata)
CREATE TABLE IF NOT EXISTS pyq_tests (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT         NOT NULL,
  exam_name         TEXT         NOT NULL DEFAULT 'CLAT PG',
  year              INTEGER,
  duration_minutes  INTEGER      NOT NULL DEFAULT 120,
  total_marks       INTEGER      NOT NULL DEFAULT 120,
  negative_marking  NUMERIC(4,2) NOT NULL DEFAULT 0.25,
  instructions      TEXT,
  is_published      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PYQ Passages
-- Stores each reading passage ONCE. Multiple questions reference the same row.
-- This avoids repeating 500-word passage text for every question.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pyq_passages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id       UUID        NOT NULL REFERENCES pyq_tests(id) ON DELETE CASCADE,
  order_index   INTEGER     NOT NULL DEFAULT 0,
  passage_text  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PYQ Questions
-- passage_id is nullable — NULL means standalone question (no passage)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pyq_questions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id         UUID        NOT NULL REFERENCES pyq_tests(id) ON DELETE CASCADE,
  passage_id      UUID        REFERENCES pyq_passages(id) ON DELETE SET NULL,
  order_index     INTEGER     NOT NULL DEFAULT 0,
  question_text   TEXT        NOT NULL,
  option_a        TEXT        NOT NULL,
  option_b        TEXT        NOT NULL,
  option_c        TEXT        NOT NULL,
  option_d        TEXT        NOT NULL,
  correct_answer  CHAR(1)     NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  explanation     TEXT,
  marks           INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS pyq_passages_test_order  ON pyq_passages(test_id, order_index);
CREATE INDEX IF NOT EXISTS pyq_questions_test_order ON pyq_questions(test_id, order_index);
CREATE INDEX IF NOT EXISTS pyq_questions_passage    ON pyq_questions(passage_id);

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE pyq_tests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyq_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyq_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access pyq_tests"
  ON pyq_tests FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Admins full access pyq_passages"
  ON pyq_passages FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Admins full access pyq_questions"
  ON pyq_questions FOR ALL TO public USING (true) WITH CHECK (true);

-- =====================================================
-- If you already ran the OLD schema (with inline passage TEXT on pyq_questions),
-- run this migration instead:
-- =====================================================
-- CREATE TABLE IF NOT EXISTS pyq_passages ( ... as above ... );
-- ALTER TABLE pyq_questions ADD COLUMN IF NOT EXISTS passage_id UUID REFERENCES pyq_passages(id) ON DELETE SET NULL;
-- ALTER TABLE pyq_questions DROP COLUMN IF EXISTS passage;
-- CREATE INDEX IF NOT EXISTS pyq_passages_test_order  ON pyq_passages(test_id, order_index);
-- CREATE INDEX IF NOT EXISTS pyq_questions_passage    ON pyq_questions(passage_id);
