CREATE TABLE rate_limit_counters (
  key varchar(256) PRIMARY KEY,
  total_hits integer NOT NULL CHECK (total_hits >= 0),
  reset_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_counters_reset_at_idx
  ON rate_limit_counters (reset_at);

-- The application role needs access to the shared counter table.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rate_limit_counters TO carbonledger_app;
