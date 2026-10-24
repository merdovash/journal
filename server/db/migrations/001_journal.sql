-- Journal domain on the shared finance DB (portal + wallet).
-- users / sessions may already exist. Journal tables are prefixed.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS journal_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL,
  instrument TEXT NOT NULL,
  price NUMERIC(18, 6) NOT NULL,
  commission NUMERIC(18, 6) NOT NULL,
  stop_loss NUMERIC(18, 6),
  take_profit NUMERIC(18, 6),
  leverage NUMERIC(18, 6) NOT NULL,
  quantity NUMERIC(18, 6) NOT NULL,
  open_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_opens_user_opened_idx ON journal_opens (user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS journal_opens_instrument_idx ON journal_opens (instrument);

CREATE TABLE IF NOT EXISTS journal_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  open_id UUID NOT NULL UNIQUE REFERENCES journal_opens(id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ NOT NULL,
  price NUMERIC(18, 6) NOT NULL,
  commission NUMERIC(18, 6) NOT NULL,
  close_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_closes_reason_chk CHECK (close_reason IN ('manual', 'take_profit', 'stop_loss'))
);

CREATE INDEX IF NOT EXISTS journal_closes_user_closed_idx ON journal_closes (user_id, closed_at DESC);

CREATE TABLE IF NOT EXISTS journal_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  starting_balance NUMERIC(18, 6) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
