-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Replaces JS-side row counting with a server-side aggregation.
-- Returns one row per item_id with its link count — much less bandwidth than fetching all rows.

CREATE OR REPLACE FUNCTION get_link_counts(item_ids uuid[])
RETURNS TABLE(item_id uuid, link_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT item_id, COUNT(*) AS link_count
  FROM note_pdf_links
  WHERE item_id = ANY(item_ids)
  GROUP BY item_id;
$$;
