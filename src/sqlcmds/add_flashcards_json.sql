-- Add flashcards_json column to note_contents for storing AI-generated flashcards
-- Run this in Supabase SQL Editor

ALTER TABLE public.note_contents
ADD COLUMN IF NOT EXISTS flashcards_json TEXT NULL;

-- Index not needed — single row per item_id, always fetched by item_id
