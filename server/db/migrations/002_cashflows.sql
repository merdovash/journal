CREATE TABLE IF NOT EXISTS journal_cashflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount NUMERIC(18, 6) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_cashflows_kind_chk CHECK (kind IN ('deposit', 'withdrawal')),
  CONSTRAINT journal_cashflows_amount_chk CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS journal_cashflows_user_occurred_idx
  ON journal_cashflows (user_id, occurred_at DESC);
