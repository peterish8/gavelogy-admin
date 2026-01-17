-- Add unique constraint on note_item_id for upsert functionality
-- This ensures one quiz per note item (1:1 relationship)

ALTER TABLE public.attached_quizzes
ADD CONSTRAINT attached_quizzes_note_item_id_key UNIQUE (note_item_id);

-- Add foreign key constraint to link quiz_questions to attached_quizzes
ALTER TABLE public.quiz_questions
ADD CONSTRAINT quiz_questions_quiz_id_fkey 
FOREIGN KEY (quiz_id) REFERENCES public.attached_quizzes(id) ON DELETE CASCADE;
