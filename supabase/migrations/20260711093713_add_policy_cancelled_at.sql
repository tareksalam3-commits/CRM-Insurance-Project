ALTER TABLE policies ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_policies_cancelled_at ON policies(cancelled_at);
