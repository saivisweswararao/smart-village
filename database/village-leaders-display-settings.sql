-- Add admin-configurable public display order and visibility for village leaders.
-- Run once in Supabase SQL Editor after database/village-leaders.sql.
ALTER TABLE public.village_leaders
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

ALTER TABLE public.village_leaders
  DROP CONSTRAINT IF EXISTS village_leaders_priority_check;
ALTER TABLE public.village_leaders
  ADD CONSTRAINT village_leaders_priority_check
  CHECK (priority BETWEEN 0 AND 9999);

CREATE INDEX IF NOT EXISTS village_leaders_public_order_idx
  ON public.village_leaders (priority DESC, created_at ASC)
  WHERE is_visible = true;

-- Existing column-level grants must include the new admin-editable fields.
GRANT INSERT(name, designation, photo_url, priority, is_visible),
      UPDATE(name, designation, photo_url, priority, is_visible)
ON public.village_leaders TO authenticated;
