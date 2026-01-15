-- =====================================================
-- GAVELOGY ADMIN COURSE WORLD BUILDER
-- Complete Database Migration Script
-- 
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Create a new query
-- 3. Paste this entire script
-- 4. Click "Run"
-- 
-- After running, make yourself admin with:
-- UPDATE public.user_profiles SET is_admin = true WHERE email = 'YOUR_EMAIL';
-- =====================================================

-- =====================================================
-- COURSES TABLE
-- Parent container for all content
-- =====================================================
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📚',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_courses_order ON public.courses(order_index);

-- Enable RLS
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for re-running)
DROP POLICY IF EXISTS "Public can view active courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can manage courses" ON public.courses;

-- Policy: Anyone can read active courses
CREATE POLICY "Public can view active courses"
ON public.courses FOR SELECT
USING (is_active = true);

-- Policy: Only authenticated users can modify
CREATE POLICY "Authenticated users can manage courses"
ON public.courses FOR ALL
USING (auth.role() = 'authenticated');

-- =====================================================
-- MODULES TABLE
-- Sections within a course (e.g., "Constitutional Law")
-- =====================================================
CREATE TABLE IF NOT EXISTS public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📖',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_modules_course ON public.modules(course_id);
CREATE INDEX IF NOT EXISTS idx_modules_order ON public.modules(course_id, order_index);

-- Enable RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active modules" ON public.modules;
DROP POLICY IF EXISTS "Authenticated users can manage modules" ON public.modules;

CREATE POLICY "Public can view active modules"
ON public.modules FOR SELECT
USING (is_active = true);

CREATE POLICY "Authenticated users can manage modules"
ON public.modules FOR ALL
USING (auth.role() = 'authenticated');

-- =====================================================
-- CONTENT ITEMS TABLE
-- Unified content model (notes, quizzes, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('note', 'quiz', 'interactive')),
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  
  -- Content-specific fields (nullable based on type)
  -- For notes:
  note_content JSONB, -- { sections: [...], interactive_questions: [...] }
  
  -- For quizzes:
  quiz_data JSONB -- { questions: [...] }
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_content_items_module ON public.content_items(module_id);
CREATE INDEX IF NOT EXISTS idx_content_items_order ON public.content_items(module_id, order_index);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON public.content_items(content_type);

-- Enable RLS
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active content" ON public.content_items;
DROP POLICY IF EXISTS "Authenticated users can manage content" ON public.content_items;

CREATE POLICY "Public can view active content"
ON public.content_items FOR SELECT
USING (is_active = true);

CREATE POLICY "Authenticated users can manage content"
ON public.content_items FOR ALL
USING (auth.role() = 'authenticated');

-- =====================================================
-- INTERACTIVE QUESTIONS TABLE
-- Quick comprehension checks within notes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.interactive_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('true_false', 'yes_no', 'poll')),
  options JSONB, -- For polls: ["Option A", "Option B", ...]
  correct_answer TEXT, -- For true_false/yes_no
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactive_questions_content ON public.interactive_questions(content_item_id);

ALTER TABLE public.interactive_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view interactive questions" ON public.interactive_questions;
DROP POLICY IF EXISTS "Authenticated users can manage questions" ON public.interactive_questions;

CREATE POLICY "Public can view interactive questions"
ON public.interactive_questions FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage questions"
ON public.interactive_questions FOR ALL
USING (auth.role() = 'authenticated');

-- =====================================================
-- USER RESPONSES TABLE
-- Stores student answers to interactive questions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.interactive_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one response per user per question
  UNIQUE(question_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_responses_question ON public.user_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_user_responses_user ON public.user_responses(user_id);

ALTER TABLE public.user_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own responses" ON public.user_responses;

-- Users can only see/create their own responses
CREATE POLICY "Users can manage own responses"
ON public.user_responses FOR ALL
USING (auth.uid() = user_id);

-- =====================================================
-- USER PROFILES TABLE (for admin role)
-- Extends auth.users with app-specific data
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "Users can view own profile"
ON public.user_profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.user_profiles FOR UPDATE
USING (auth.uid() = id);

-- =====================================================
-- ADMIN AUDIT LOG TABLE
-- Tracks all admin actions for debugging/rollback
-- =====================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'reorder'
  entity_type TEXT NOT NULL, -- 'course', 'module', 'content_item'
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

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- =====================================================
-- FUNCTION: Check if current user is admin
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNCTION: Get aggregate responses for a question
-- Returns percentages, not counts (privacy)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_question_responses(question_uuid UUID)
RETURNS TABLE (
  answer TEXT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ur.answer,
    ROUND((COUNT(*)::NUMERIC / NULLIF((
      SELECT COUNT(*) FROM public.user_responses 
      WHERE question_id = question_uuid
    ), 0)) * 100, 1) as percentage
  FROM public.user_responses ur
  WHERE ur.question_id = question_uuid
  GROUP BY ur.answer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER: Auto-update 'updated_at' timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if any (for re-running)
DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
DROP TRIGGER IF EXISTS update_modules_updated_at ON public.modules;
DROP TRIGGER IF EXISTS update_content_items_updated_at ON public.content_items;
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_modules_updated_at
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- TRIGGER: Auto-create user profile on signup
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicates on re-run
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- SEED DATA (Optional - Uncomment to create test data)
-- =====================================================

-- -- Create user profile for existing auth users
-- INSERT INTO public.user_profiles (id, email, is_admin)
-- SELECT id, email, false FROM auth.users
-- ON CONFLICT (id) DO NOTHING;

-- -- Seed some courses
-- INSERT INTO public.courses (name, description, icon, order_index) VALUES
--   ('Contemporary Cases 2024-25', 'Latest landmark judgments and case analyses', '⚖️', 1),
--   ('Static Subjects', 'Core law subjects with foundational concepts', '📚', 2)
-- ON CONFLICT DO NOTHING;

-- -- Seed modules for Contemporary Cases
-- INSERT INTO public.modules (course_id, name, description, icon, order_index)
-- SELECT 
--   c.id,
--   m.name,
--   m.description,
--   m.icon,
--   m.order_index
-- FROM public.courses c
-- CROSS JOIN (
--   VALUES 
--     ('Constitutional Law', 'Fundamental rights and constitutional principles', '📜', 1),
--     ('Criminal Law', 'Criminal procedure and substantive law', '⚔️', 2),
--     ('Contract Law', 'Principles of contract and commercial law', '📝', 3)
-- ) AS m(name, description, icon, order_index)
-- WHERE c.name = 'Contemporary Cases 2024-25'
-- ON CONFLICT DO NOTHING;

-- =====================================================
-- MIGRATION COMPLETE! 🎉
-- 
-- NEXT STEPS:
-- 1. Make yourself an admin:
--    UPDATE public.user_profiles SET is_admin = true WHERE email = 'YOUR_EMAIL';
--
-- 2. (Optional) Uncomment and run the SEED DATA section above
--
-- 3. Verify in Supabase Table Editor that all tables exist
-- =====================================================

SELECT 'Migration completed successfully! Tables created: courses, modules, content_items, interactive_questions, user_responses, user_profiles, admin_audit_log' AS status;
