-- ADD FOREIGN KEY CASCADE CONSTRAINTS
-- Ensures that when a structure_item is deleted, all related rows are
-- automatically removed by the database instead of becoming orphaned.
--
-- Run this once in the Supabase SQL Editor.
-- Safe to run multiple times — uses DROP CONSTRAINT IF EXISTS before adding.

-- ── note_contents ────────────────────────────────────────────────────────────
-- item_id currently has no FK. Add one with CASCADE so deleting a
-- structure_item automatically deletes its note.

ALTER TABLE public.note_contents
  DROP CONSTRAINT IF EXISTS note_contents_item_id_fkey;

ALTER TABLE public.note_contents
  ADD CONSTRAINT note_contents_item_id_fkey
  FOREIGN KEY (item_id)
  REFERENCES public.structure_items(id)
  ON DELETE CASCADE;

-- ── attached_quizzes ─────────────────────────────────────────────────────────
-- note_item_id currently only has a UNIQUE constraint, no FK.
-- quiz_questions already cascades from attached_quizzes, so this one entry
-- handles the whole quiz → questions chain.

ALTER TABLE public.attached_quizzes
  DROP CONSTRAINT IF EXISTS attached_quizzes_note_item_id_fkey;

ALTER TABLE public.attached_quizzes
  ADD CONSTRAINT attached_quizzes_note_item_id_fkey
  FOREIGN KEY (note_item_id)
  REFERENCES public.structure_items(id)
  ON DELETE CASCADE;

-- ── note_pdf_links ───────────────────────────────────────────────────────────
-- item_id has no FK. Add one with CASCADE.

ALTER TABLE public.note_pdf_links
  DROP CONSTRAINT IF EXISTS note_pdf_links_item_id_fkey;

ALTER TABLE public.note_pdf_links
  ADD CONSTRAINT note_pdf_links_item_id_fkey
  FOREIGN KEY (item_id)
  REFERENCES public.structure_items(id)
  ON DELETE CASCADE;

-- ── draft_content_cache ──────────────────────────────────────────────────────
-- original_content_id has no FK. Add one with CASCADE so drafts are cleaned
-- up when the item they belong to is deleted.

ALTER TABLE public.draft_content_cache
  DROP CONSTRAINT IF EXISTS draft_content_cache_original_content_id_fkey;

ALTER TABLE public.draft_content_cache
  ADD CONSTRAINT draft_content_cache_original_content_id_fkey
  FOREIGN KEY (original_content_id)
  REFERENCES public.structure_items(id)
  ON DELETE CASCADE;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Run this to confirm all 4 constraints exist:
SELECT
  tc.table_name,
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('note_contents', 'attached_quizzes', 'note_pdf_links', 'draft_content_cache')
ORDER BY tc.table_name;
