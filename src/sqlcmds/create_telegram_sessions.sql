-- Telegram bot session state table
-- Run this once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS telegram_sessions (
  chat_id    BIGINT      PRIMARY KEY,
  state      TEXT        NOT NULL DEFAULT 'idle',
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS needed — only accessed via service role key from the bot
