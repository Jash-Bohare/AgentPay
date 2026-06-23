export interface X402PaymentPayload {
  from: string; // agent account hash
  from_public_key: string; // agent's public key hex - required to verify `signature`,
  // since account hashes are one-way and can't be turned back into a public key
  to: string; // provider account hash
  amount: string; // motes, as a string (avoids precision loss for large values)
  listing_id: number;
  nonce: string; // UUID v4, used for replay protection
  expires_at: number; // unix seconds, short TTL (~30s)
  facilitator_url: string;
}

export interface X402Payload {
  protocol: 'x402';
  version: '1';
  scheme: 'casper-cspr';
  network: 'casper-test';
  payload: X402PaymentPayload;
  signature: string; // hex, produced by services/casper.ts signMessage() over canonicalizePaymentPayload(payload)
}

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

/**
 * Deterministic serialization of a payment payload for signing/verification.
 * Field order is fixed explicitly so it doesn't depend on how the caller built
 * the object - the signer (agent / future MCP server) and verifier (this backend)
 * must produce byte-identical output for the same logical payload.
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
    facilitator_url: p.facilitator_url
  });
}

/** Narrows an unknown request body down to X402Payload, or returns null if malformed. */
export function parseX402Payload(body: unknown): X402Payload | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  if (b.protocol !== 'x402' || b.version !== '1' || b.scheme !== 'casper-cspr' || b.network !== 'casper-test') {
    return null;
  }
  
  if (typeof b.signature !== 'string' || b.signature.length === 0) return null;
  if (typeof b.payload !== 'object' || b.payload === null) return null;

  const p = b.payload as Record<string, unknown>;
  if (typeof p.from !== 'string' || p.from.length === 0) return null;
  if (typeof p.from_public_key !== 'string' || p.from_public_key.length === 0) return null;
  if (typeof p.to !== 'string' || p.to.length === 0) return null;
  if (typeof p.amount !== 'string' || !/^\d+$/.test(p.amount)) return null;
  console.log(
    'LISTING_ID VALUE:',
    p.listing_id,
    'TYPE:',
    typeof p.listing_id
  );
  const listingId =
    typeof p.listing_id === 'string'
      ? Number(p.listing_id)
      : p.listing_id;

  if (typeof listingId !== 'number' || !Number.isInteger(listingId)) {
    return null;
  }
  if (typeof p.nonce !== 'string' || p.nonce.length === 0) return null;
  if (typeof p.expires_at !== 'number' || !Number.isInteger(p.expires_at)) return null;
  if (typeof p.facilitator_url !== 'string') return null;

  return {
    ...body as X402Payload,
    payload: {
      ...(body as X402Payload).payload,
      listing_id: listingId
    }
  };
}
