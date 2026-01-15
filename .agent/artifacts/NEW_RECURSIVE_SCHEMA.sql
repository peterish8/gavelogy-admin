-- DANGEROUS: Wipe ALL existing tables to start fresh
DROP VIEW IF EXISTS user_course_stats CASCADE;

-- Drop dependent tables first to avoid foreign key errors
DROP TABLE IF EXISTS admin_audit_log CASCADE;
DROP TABLE IF EXISTS contemporary_case_quizzes CASCADE;
DROP TABLE IF EXISTS contemporary_mistakes CASCADE;
DROP TABLE IF EXISTS contemprory_case_notes CASCADE;
DROP TABLE IF EXISTS interactive_question_aggregates CASCADE;
DROP TABLE IF EXISTS interactive_questions CASCADE;
DROP TABLE IF EXISTS interactive_responses CASCADE;
DROP TABLE IF EXISTS content_items CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS user_courses CASCADE;
DROP TABLE IF EXISTS user_mistakes CASCADE;
DROP TABLE IF EXISTS user_quiz_attempts CASCADE;
DROP TABLE IF EXISTS user_streaks CASCADE;
DROP TABLE IF EXISTS user_case_completion CASCADE;
DROP TABLE IF EXISTS user_confidence_stats CASCADE;
DROP TABLE IF EXISTS quiz_attempts CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS pyq_2020_questions CASCADE;
DROP TABLE IF EXISTS pyq_subject_topic CASCADE;
DROP TABLE IF EXISTS payment_orders CASCADE;
DROP TABLE IF EXISTS mistakes CASCADE;

-- Also drop new schema tables if they were partially created
DROP TABLE IF EXISTS quiz_questions CASCADE;
DROP TABLE IF EXISTS attached_quizzes CASCADE;
DROP TABLE IF EXISTS note_contents CASCADE;
DROP TABLE IF EXISTS structure_items CASCADE;

-- (Keep 'users' table in 'auth' schema safe, assuming public.users is a mirror or not critical to wipe if it stores auth data)
-- If public.users is your custom table, uncomment the next line:
-- DROP TABLE IF EXISTS public.users CASCADE;

-- 1. COURSES (The "Worlds")
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '📚', -- Emoji icon
    price INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT false,
    order_index INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. STRUCTURE_ITEMS (Recursive Modules & Files Tree)
-- This single table handles: Modules, Sub-modules, Sub-sub-modules, and Note Files
CREATE TABLE structure_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES structure_items(id) ON DELETE CASCADE, -- Recursive parent
    
    item_type TEXT NOT NULL CHECK (item_type IN ('folder', 'file')), -- 'folder'=Module, 'file'=Note
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT, -- Emoji
    
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0, -- Ordering within the folder
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast tree traversal
CREATE INDEX idx_structure_parent ON structure_items(parent_id);
CREATE INDEX idx_structure_course ON structure_items(course_id);

-- 3. NOTE_CONTENTS (The actual text content)
-- Separate table to keep the tree structure lightweight
CREATE TABLE note_contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID UNIQUE REFERENCES structure_items(id) ON DELETE CASCADE, -- 1:1 Link to a 'file' item
    
    content_html TEXT, -- Rich Text content
    search_vector TSVECTOR, -- For full-text search later
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ATTACHED_QUIZZES (One Quiz per Note File)
CREATE TABLE attached_quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_item_id UUID UNIQUE REFERENCES structure_items(id) ON DELETE CASCADE, -- 1:1 Link to the Note Item
    
    title TEXT, -- Optional override title
    passing_score INTEGER DEFAULT 70,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. QUIZ_QUESTIONS (Questions inside the attached quiz)
CREATE TABLE quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID REFERENCES attached_quizzes(id) ON DELETE CASCADE,
    
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'single_choice', -- single_choice, multi_choice, true_false
    options JSONB, -- Array of strings: ["Option A", "Option B"]
    correct_answer TEXT, -- The correct string or index
    explanation TEXT, -- shown after answering
    
    order_index INTEGER DEFAULT 0
);

-- 6. QUIZ_ATTEMPTS (User progress for these quizzes)
CREATE TABLE quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    quiz_id UUID REFERENCES attached_quizzes(id) ON DELETE CASCADE,
    
    score INTEGER,
    passed BOOLEAN DEFAULT false,
    answers JSONB, -- Store user's specific answers
    
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRIGGER: Update 'updated_at' automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_courses_modtime BEFORE UPDATE ON courses FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_structure_modtime BEFORE UPDATE ON structure_items FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_notes_modtime BEFORE UPDATE ON note_contents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- RLS POLICIES (Admin Full Access, User Read Access)
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE structure_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE attached_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

-- 1. COURSES POLICIES
CREATE POLICY "Admins full access courses" ON courses
    FOR ALL
    USING (public.is_admin() = true)
    WITH CHECK (public.is_admin() = true);

CREATE POLICY "Everyone view active courses" ON courses
    FOR SELECT
    USING (is_active = true OR public.is_admin() = true);

-- 2. STRUCTURE_ITEMS POLICIES (Modules/Notes)
CREATE POLICY "Admins full access structure" ON structure_items
    FOR ALL
    USING (public.is_admin() = true)
    WITH CHECK (public.is_admin() = true);

CREATE POLICY "Everyone view structure" ON structure_items
    FOR SELECT
    USING (is_active = true OR public.is_admin() = true);

-- 3. NOTE_CONTENTS POLICIES
CREATE POLICY "Admins full access notes" ON note_contents
    FOR ALL
    USING (public.is_admin() = true)
    WITH CHECK (public.is_admin() = true);

CREATE POLICY "Everyone view notes" ON note_contents
    FOR SELECT
    USING (true); -- Access controlled by parent structure_item visibility logically

-- 4. ATTACHED_QUIZZES POLICIES
CREATE POLICY "Admins full access quizzes" ON attached_quizzes
    FOR ALL
    USING (public.is_admin() = true)
    WITH CHECK (public.is_admin() = true);

CREATE POLICY "Everyone view quizzes" ON attached_quizzes
    FOR SELECT
    USING (true);

-- 5. QUIZ_QUESTIONS POLICIES
CREATE POLICY "Admins full access questions" ON quiz_questions
    FOR ALL
    USING (public.is_admin() = true)
    WITH CHECK (public.is_admin() = true);

CREATE POLICY "Everyone view questions" ON quiz_questions
    FOR SELECT
    USING (true);

-- 6. QUIZ_ATTEMPTS POLICIES (Users manage their own attempts)
CREATE POLICY "Admins view all attempts" ON quiz_attempts
    FOR SELECT
    USING (public.is_admin() = true);

CREATE POLICY "Users manage own attempts" ON quiz_attempts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
