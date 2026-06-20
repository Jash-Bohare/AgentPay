// ---------------------------------------------------------------------------
// Listing (mirrors Postgres listings table + Registry on-chain struct)
// ---------------------------------------------------------------------------

export type Category = 'PriceData' | 'Compute' | 'Compliance' | 'Document' | 'Other';
export type ReputationTier = 'New' | 'Established' | 'Trusted' | 'Elite';

/** A listing row as returned by the backend's GET /listings endpoint. */
export interface Listing {
  listing_id: number;
  provider_wallet: string;
  name: string;
  description: string;
  endpoint_url: string;
  /** Price in motes, stored as a string to avoid precision loss. */
  price_motes: string;
  category: Category;
  is_active: boolean;
  reputation_tier: ReputationTier | null;
  total_calls: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Provider reputation (mirrors Reputation contract's ProviderScore)
// ---------------------------------------------------------------------------

export interface ProviderScore {
  total_calls_served: string;
  successful_calls: string;
  failed_calls: string;
  total_cspr_earned: string;
  uptime_score: number;
  accuracy_score: number;
  reputation_tier: ReputationTier;
  last_updated: string;
}

// ---------------------------------------------------------------------------
// x402 payment protocol types (identical to backend/src/types.ts)
// ---------------------------------------------------------------------------

export interface X402PaymentPayload {
  from: string;           // agent account hash (bare hex, no prefix)
  from_public_key: string; // agent's full public key hex (required for signature verification)
  to: string;             // provider account hash (bare hex, no prefix)
  amount: string;         // motes as string — matches listing price_motes exactly
  listing_id: number;
  nonce: string;          // unique per request, for replay protection
  expires_at: number;     // unix timestamp (seconds), short TTL ~30s
  facilitator_url: string;
}

export interface X402Payload {
  protocol: 'x402';
  version: '1';
  scheme: 'casper-cspr';
  network: 'casper-test';
  payload: X402PaymentPayload;
  signature: string; // hex-encoded ed25519 signature over canonicalizePaymentPayload(payload)
}

/**
 * Deterministic serialization of the payment payload for signing.
 * Field order is fixed so the MCP server (signer) and the backend (verifier)
 * produce identical bytes for the same logical payload — mirrors the backend's
 * own canonicalizePaymentPayload() exactly.
 */
export function canonicalizePaymentPayload(p: X402PaymentPayload): string {
  return JSON.stringify({
    from: p.from,
    from_public_key: p.from_public_key,
    to: p.to,
    amount: p.amount,
    listing_id: p.listing_id,
    nonce: p.nonce,
    expires_at: p.expires_at,
    facilitator_url: p.facilitator_url,
  });
}

// ---------------------------------------------------------------------------
// Backend API response shapes
// ---------------------------------------------------------------------------

export interface VerifyReceipt {
  tx_hash: string;
  settled_amount: string;
  facilitator_signature: string;
  timestamp: number;
}

export interface VerifyResponse {
  valid: boolean;
  receipt?: VerifyReceipt;
  error?: string;
  error_detail?: string;
}

export interface BalanceResponse {
  wallet: string;
  balance_motes: string;
  daily_limit_motes: string | null;
  spent_today_motes: string;
}

export interface TransactionRecord {
  tx_id: number;
  listing_id: number;
  provider_wallet: string;
  gross_amount_motes: string;
  protocol_fee_motes: string;
  net_amount_motes: string;
  on_chain_tx_hash: string;
  status: 'pending' | 'transfer_only' | 'settled' | 'failed';
  created_at: string;
}
