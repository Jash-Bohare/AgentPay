-- Mirror of on-chain listings for fast queries (source of truth is the Registry contract)
CREATE TABLE IF NOT EXISTS listings (
  listing_id BIGINT PRIMARY KEY,
  provider_wallet VARCHAR(68) NOT NULL,
  name TEXT,
  description TEXT,
  endpoint_url TEXT,
  price_motes NUMERIC,
  category VARCHAR(50),
  is_active BOOLEAN,
  reputation_tier VARCHAR(20),
  total_calls BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ
);

-- Agent spending limits (off-chain config, enforced by the facilitator)
CREATE TABLE IF NOT EXISTS agent_limits (
  agent_wallet VARCHAR(68) PRIMARY KEY,
  daily_limit_motes NUMERIC NOT NULL,
  spent_today_motes NUMERIC DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW()
);

-- Off-chain transaction log (mirror of on-chain for fast dashboard queries)
CREATE TABLE IF NOT EXISTS transactions (
  tx_id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT,
  agent_wallet VARCHAR(68),
  provider_wallet VARCHAR(68),
  gross_amount_motes NUMERIC,
  protocol_fee_motes NUMERIC,
  net_amount_motes NUMERIC,
  on_chain_tx_hash VARCHAR(100),
  status VARCHAR(20), -- pending | settled | failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nonce deduplication (also cached in Redis; Postgres is the durable backup)
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce UUID PRIMARY KEY,
  agent_wallet VARCHAR(68),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
