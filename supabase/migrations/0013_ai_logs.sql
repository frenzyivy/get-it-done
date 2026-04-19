-- PLAN.md § 2 — ai_logs: every Claude API call is logged with token counts
-- so we can monitor cost and debug prompts. See get-it-done-web/lib/anthropic.ts
-- (runAgent) for the call sites that INSERT into this table.
--
-- NOTE: this file was lost from the repo locally and has been reconstructed
-- from the runAgent() insert shape. The column set below is derived — if the
-- production schema diverges, reconcile before running on a fresh database.

CREATE TABLE IF NOT EXISTS ai_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own logs (useful for a per-user cost page later).
CREATE POLICY "Users read own ai_logs" ON ai_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role writes. No INSERT policy for authenticated users — the
-- runAgent helper uses supabaseAdmin() and bypasses RLS on INSERT.

CREATE INDEX IF NOT EXISTS idx_ai_logs_user_created
  ON ai_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_agent
  ON ai_logs (agent);
