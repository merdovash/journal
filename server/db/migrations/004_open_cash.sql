ALTER TABLE journal_opens
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(18, 6);
