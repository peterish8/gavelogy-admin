-- =====================================================
-- GAVELOGY ADMIN COURSE WORLD BUILDER
-- UPDATED Database Migration Script
-- 
-- Based on existing schema analysis from Completesqljson.json
-- This script only adds/modifies what's missing
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Create a new query
-- 3. Paste this entire script
-- 4. Click "Run"
-- =====================================================

-- =====================================================
-- STEP 1: ALTER EXISTING TABLES
-- Add missing columns to existing tables
-- =====================================================

-- Add missing columns to `courses` table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '📚',
ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for ordering if not exists
CREATE INDEX IF NOT EXISTS idx_courses_order ON public.courses(order_index);

-- Add missing columns to `subjects` table (this serves as our "modules")
ALTER TABLE public.subjects 
ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '📖',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for ordering if not exists
CREATE INDEX IF NOT EXISTS idx_subjects_course ON public.subjects(course_id);
CREATE INDEX IF NOT EXISTS idx_subjects_order ON public.subjects(course_id, order_index);

-- Add is_admin column to existing `users` table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- =====================================================
-- STEP 2: CREATE CONTENT_ITEMS TABLE
-- Unified content model within subjects (notes, quizzes, etc.)
-- This replaces the need for separate linking
-- =====================================================
CREATE TABLE IF NOT EXISTS public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('note', 'quiz', 'interactive', 'case_note')),
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  
  -- Content-specific fields (nullable based on type)
  -- For notes: Rich HTML content
  note_content JSONB, -- { html: "...", sections: [...] }
  
  -- For quizzes: Reference to existing quiz
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE SET NULL,
  
  -- For case notes: Reference to existing case note
  case_number TEXT, -- Links to contemprory_case_notes.case_number
  
  -- For interactive: Inline interactive content
  interactive_data JSONB -- { questions: [...] }
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_content_items_subject ON public.content_items(subject_id);
CREATE INDEX IF NOT EXISTS idx_content_items_order ON public.content_items(subject_id, order_index);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON public.content_items(content_type);
CREATE INDEX IF NOT EXISTS idx_content_items_quiz ON public.content_items(quiz_id);

-- Enable RLS
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for re-running)
DROP POLICY IF EXISTS "Public can view active content" ON public.content_items;
DROP POLICY IF EXISTS "Authenticated users can manage content" ON public.content_items;
DROP POLICY IF EXISTS "Admins can manage all content" ON public.content_items;

-- Policy: Anyone can read active content
CREATE POLICY "Public can view active content"
ON public.content_items FOR SELECT
USING (is_active = true);

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage all content"
ON public.content_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- =====================================================
-- STEP 3: CREATE INTERACTIVE_QUESTIONS TABLE
-- Quick comprehension checks within notes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.interactive_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('true_false', 'yes_no', 'poll')),
  options JSONB, -- For polls: ["Option A", "Option B", ...]
  correct_answer TEXT, -- For true_false: "true"/"false", for yes_no: "yes"/"no"
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactive_questions_content ON public.interactive_questions(content_item_id);
CREATE INDEX IF NOT EXISTS idx_interactive_questions_order ON public.interactive_questions(content_item_id, order_index);

ALTER TABLE public.interactive_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view interactive questions" ON public.interactive_questions;
DROP POLICY IF EXISTS "Admins can manage questions" ON public.interactive_questions;

CREATE POLICY "Public can view interactive questions"
ON public.interactive_questions FOR SELECT
USING (true);

CREATE POLICY "Admins can manage questions"
ON public.interactive_questions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- =====================================================
-- STEP 4: CREATE USER_RESPONSES TABLE
-- Stores student answers to interactive questions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.interactive_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.interactive_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one response per user per question
  UNIQUE(question_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_interactive_responses_question ON public.interactive_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_interactive_responses_user ON public.interactive_responses(user_id);

ALTER TABLE public.interactive_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own responses" ON public.interactive_responses;
DROP POLICY IF EXISTS "Users can create own responses" ON public.interactive_responses;

-- Users can only see their own responses
CREATE POLICY "Users can view own responses"
ON public.interactive_responses FOR SELECT
USING (auth.uid() = user_id);

-- Users can only create their own responses
CREATE POLICY "Users can create own responses"
ON public.interactive_responses FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- STEP 5: CREATE ADMIN_AUDIT_LOG TABLE
-- Tracks all admin actions for debugging/rollback
-- =====================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'reorder')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('course', 'subject', 'content_item', 'quiz', 'question')),
  entity_id UUID NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.admin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_log;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Only admins can insert audit logs
CREATE POLICY "Admins can insert audit logs"
ON public.admin_audit_log FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- =====================================================
-- STEP 6: CREATE HELPER FUNCTIONS
-- =====================================================

-- Function: Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get aggregate responses for a question (percentages only, not counts)
CREATE OR REPLACE FUNCTION public.get_question_responses(question_uuid UUID)
RETURNS TABLE (
  answer TEXT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ir.answer,
    ROUND((COUNT(*)::NUMERIC / NULLIF((
      SELECT COUNT(*) FROM public.interactive_responses 
      WHERE question_id = question_uuid
    ), 0)) * 100, 1) as percentage
  FROM public.interactive_responses ir
  WHERE ir.question_id = question_uuid
  GROUP BY ir.answer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Auto-update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 7: CREATE TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- =====================================================

-- Drop existing triggers if any (for re-running)
DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
DROP TRIGGER IF EXISTS update_subjects_updated_at ON public.subjects;
DROP TRIGGER IF EXISTS update_content_items_updated_at ON public.content_items;

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- STEP 8: UPDATE RLS POLICIES FOR EXISTING TABLES
-- Add admin management policies
-- =====================================================

-- Enable RLS on courses if not enabled
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;

CREATE POLICY "Public can view active courses"
ON public.courses FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage courses"
ON public.courses FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Enable RLS on subjects if not enabled
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;

CREATE POLICY "Public can view active subjects"
ON public.subjects FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage subjects"
ON public.subjects FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Enable RLS on quizzes if not enabled
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Admins can manage quizzes" ON public.quizzes;

CREATE POLICY "Public can view quizzes"
ON public.quizzes FOR SELECT
USING (true);

CREATE POLICY "Admins can manage quizzes"
ON public.quizzes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- =====================================================
-- MIGRATION COMPLETE! 🎉
-- 
-- NEXT STEPS:
-- 1. Make yourself an admin:
--    UPDATE public.users SET is_admin = true WHERE email = 'YOUR_EMAIL';
--
-- 2. Verify in Supabase Table Editor that:
--    - courses has: icon, order_index, version columns
--    - subjects has: icon, is_active, version columns
--    - users has: is_admin column
--    - content_items table exists
--    - interactive_questions table exists
--    - interactive_responses table exists
--    - admin_audit_log table exists
-- =====================================================

SELECT 'Migration completed successfully!' AS status,
       'New tables: content_items, interactive_questions, interactive_responses, admin_audit_log' AS tables_created,
       'Updated tables: courses, subjects, users' AS tables_modified;
