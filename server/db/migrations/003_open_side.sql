ALTER TABLE journal_opens
  ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'long';

ALTER TABLE journal_opens DROP CONSTRAINT IF EXISTS journal_opens_side_chk;

ALTER TABLE journal_opens
  ADD CONSTRAINT journal_opens_side_chk CHECK (side IN ('long', 'short'));
