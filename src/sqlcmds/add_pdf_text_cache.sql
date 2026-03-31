-- ADD pdf_text_cache COLUMN TO structure_items
-- Stores the parsed plain text of the attached PDF judgment.
-- This lets the MCP server skip re-downloading + re-parsing on Vercel cold starts.
-- The column is populated automatically the first time get_judgment_text is called.

ALTER TABLE public.structure_items
  ADD COLUMN IF NOT EXISTS pdf_text_cache TEXT NULL;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'structure_items'
  AND column_name = 'pdf_text_cache';
