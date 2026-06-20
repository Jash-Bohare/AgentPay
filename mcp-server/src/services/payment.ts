/**
 * MCP server payment service.
 *
 * Constructs, signs, and sends x402 payment payloads. This is the critical path
 * that makes the MCP server an autonomous payment agent — from the agent's
 * perspective it just calls an API, and this service handles all the payment
 * plumbing invisibly.
 *
 * The x402 flow is:
 *   1. Construct the payment payload (from, to, amount, listing_id, nonce, TTL)
 *   2. Canonicalize it deterministically (fixed field order)
 *   3. Sign the canonical string with the agent's private key
 *   4. Attach the full X402Payload as the X-Payment header on the HTTP request
 *   5. Send the request to the provider's endpoint
 *   6. The provider's middleware forwards the header to the backend /verify
 *   7. If verified, the provider returns their API response
 */

import { getAgentPublicKeyHex, signMessage } from './casper.js';
import { canonicalizePaymentPayload } from '../types.js';
import type { Listing, VerifyResponse, X402Payload, X402PaymentPayload } from '../types.js';

const BACKEND_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';
/** Payment payload TTL — the backend rejects payloads that have expired. */
const PAYLOAD_TTL_SECONDS = 30;

/**
 * Generates a UUID v4 suitable for the nonce field. Each call produces a fresh
 * random UUID so every payment is unique (replay protection is enforced by the
 * backend's Redis nonce cache).
 */
function generateNonce(): string {
  // crypto.randomUUID() is available in Node.js 19+; we polyfill for safety
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC 4122 v4 UUID using Math.random (adequate for nonce uniqueness)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Constructs and signs a complete x402 payment payload for the given listing.
 *
 * The `agentWallet` is the bare account hash hex (no "account-hash-" prefix).
 * The listing's `provider_wallet` becomes the `to` field.
 * The listing's `price_motes` becomes the `amount` field — the backend rejects
 * any payload where `amount` doesn't match the on-chain listing price exactly.
 */
export function buildX402Payload(listing: Listing, agentWalletHash: string): X402Payload {
  const now = Math.floor(Date.now() / 1000);

  const innerPayload: X402PaymentPayload = {
    from: agentWalletHash,
    from_public_key: getAgentPublicKeyHex(),
    to: listing.provider_wallet,
    amount: listing.price_motes,
    listing_id: listing.listing_id,
    nonce: generateNonce(),
    expires_at: now + PAYLOAD_TTL_SECONDS,
    facilitator_url: BACKEND_URL,
  };

  const canonical = canonicalizePaymentPayload(innerPayload);
  const signature = signMessage(canonical);

  return {
    protocol: 'x402',
    version: '1',
    scheme: 'casper-cspr',
    network: 'casper-test',
    payload: innerPayload,
    signature,
  };
}

export interface CallApiOptions {
  listing: Listing;
  agentWalletHash: string;
  requestBody?: Record<string, unknown> | undefined;
  requestHeaders?: Record<string, string> | undefined;
}

export interface CallApiResult {
  success: boolean;
  /** HTTP status code returned by the provider API. */
  httpStatus: number;
  /** The provider's JSON response body, or a plain string if non-JSON. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  /** The payment receipt returned by the backend after verification. */
  receipt?: VerifyResponse['receipt'];
  /** Error detail if success is false. */
  error?: string;
}

/**
 * Makes an authenticated, paid API call to a provider via the x402 protocol.
 *
 * Steps:
 *   1. Build and sign the x402 payment payload.
 *   2. Encode it as JSON and attach it as the `X-Payment` header.
 *   3. POST to the provider's endpoint URL with the agent's original request body.
 *   4. If the provider responds with 402, the payment was rejected — surface the error.
 *   5. Otherwise, parse and return the provider's response.
 *
 * The provider's middleware forwards the X-Payment header to the backend /verify
 * transparently; the agent only sees step 5 and above.
 */
export async function callProviderApi(options: CallApiOptions): Promise<CallApiResult> {
  const { listing, agentWalletHash, requestBody, requestHeaders = {} } = options;

  const x402Payload = buildX402Payload(listing, agentWalletHash);
  const paymentHeader = JSON.stringify(x402Payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Payment': paymentHeader,
    ...requestHeaders,
  };

  const fetchInit: RequestInit = {
    method: 'POST',
    headers,
  };
  if (requestBody !== undefined) {
    fetchInit.body = JSON.stringify(requestBody);
  }

  let response: Response;
  try {
    response = await fetch(listing.endpoint_url, fetchInit);
  } catch (networkErr) {
    return {
      success: false,
      httpStatus: 0,
      data: null,
      error: `Network error reaching provider at ${listing.endpoint_url}: ${String(networkErr)}`,
    };
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (response.status === 402) {
    // Payment rejected by the provider middleware
    const body = isJson ? ((await response.json()) as VerifyResponse) : { error: await response.text() };
    return {
      success: false,
      httpStatus: 402,
      data: body,
      error: typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : 'payment_rejected',
    };
  }

  const data = isJson ? await response.json() : await response.text();
  return {
    success: response.ok,
    httpStatus: response.status,
    data,
  };
}
