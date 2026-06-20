/**
 * @agentpay/middleware
 *
 * Express middleware that enforces x402 micropayment verification on any route.
 *
 * Usage:
 *   import { agentPayMiddleware } from '@agentpay/middleware';
 *
 *   app.use('/price', agentPayMiddleware({
 *     listing_id: 3,
 *     provider_wallet: 'abc123...',
 *     facilitator_url: 'http://localhost:3001',
 *     expected_price_motes: '500000',
 *   }), priceHandler);
 *
 * Flow:
 *   1. If X-Payment header is absent → 402 with pricing hint so the agent knows
 *      where to get payment authorization.
 *   2. If present → POST the header body (the x402 JSON) to the facilitator's
 *      /verify endpoint.
 *   3. If verification fails → 402 with the specific error from the facilitator
 *      so the agent can diagnose the failure (expired, insufficient balance, etc.).
 *   4. If verification succeeds → attach the receipt to `req.paymentReceipt` and
 *      call next() to let the provider handler run.
 */

import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentPayMiddlewareConfig {
  /** The listing ID this endpoint corresponds to in the AgentPay registry. */
  listing_id: number;
  /** The provider's Casper account hash (bare hex, no prefix). */
  provider_wallet: string;
  /** Base URL of the AgentPay facilitator backend, e.g. http://localhost:3001 */
  facilitator_url: string;
  /** The exact price per call in motes (string to avoid precision loss). */
  expected_price_motes: string;
}

export interface PaymentReceipt {
  tx_hash: string;
  settled_amount: string;
  facilitator_signature: string;
  timestamp: number;
}

/** Attached to `req.paymentReceipt` after successful verification. */
declare module 'express' {
  interface Request {
    paymentReceipt?: PaymentReceipt | undefined;
  }
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export function agentPayMiddleware(config: AgentPayMiddlewareConfig) {
  const verifyUrl = `${config.facilitator_url}/verify`;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paymentHeader = req.headers['x-payment'];

    // ── No payment header ──────────────────────────────────────────────────
    if (!paymentHeader) {
      res.status(402).json({
        error: 'payment_required',
        message:
          'This API requires an x402 micropayment. ' +
          'Include a signed X-Payment header to access this endpoint.',
        listing_id: config.listing_id,
        price_motes: config.expected_price_motes,
        facilitator_url: config.facilitator_url,
        provider_wallet: config.provider_wallet,
      });
      return;
    }

    // ── Parse the header ───────────────────────────────────────────────────
    let paymentBody: unknown;
    try {
      paymentBody = typeof paymentHeader === 'string'
        ? JSON.parse(paymentHeader)
        : JSON.parse(Array.isArray(paymentHeader) ? paymentHeader[0] ?? '' : '');
    } catch {
      res.status(400).json({
        error: 'malformed_payment_header',
        message: 'X-Payment header is not valid JSON.',
      });
      return;
    }

    // ── Forward to facilitator /verify ─────────────────────────────────────
    let verifyRes: Response;
    let verifyBody: unknown;
    try {
      const fetchRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentBody),
      });
      verifyBody = await fetchRes.json();
      // Use a local variable so TypeScript doesn't confuse it with Express Response
      verifyRes = fetchRes as unknown as Response;
      void verifyRes; // suppres unused-variable lint
    } catch (networkErr) {
      res.status(502).json({
        error: 'facilitator_unreachable',
        message: `Could not reach the AgentPay facilitator at ${verifyUrl}: ${String(networkErr)}`,
      });
      return;
    }

    // ── Check verification result ──────────────────────────────────────────
    const result = verifyBody as { valid?: boolean; error?: string; receipt?: PaymentReceipt };

    if (!result.valid) {
      res.status(402).json({
        error: result.error ?? 'payment_verification_failed',
        message: friendlyError(result.error),
        listing_id: config.listing_id,
        price_motes: config.expected_price_motes,
        facilitator_url: config.facilitator_url,
      });
      return;
    }

    // ── Payment verified — attach receipt and pass through ─────────────────
    if (result.receipt) {
      req.paymentReceipt = result.receipt;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function friendlyError(code?: string): string {
  switch (code) {
    case 'payment_expired':
      return 'The payment authorization has expired. Please retry with a fresh payment.';
    case 'duplicate_nonce':
      return 'This payment has already been used. Each X-Payment header can only be used once.';
    case 'invalid_signature':
      return 'The payment signature is invalid. Ensure you are signing with the correct agent private key.';
    case 'public_key_mismatch':
      return 'The public key in the payload does not match the claimed from address.';
    case 'listing_not_found':
      return 'The listing referenced in the payment does not exist or is inactive.';
    case 'price_mismatch':
      return 'The payment amount does not match the listing price. Fetch the latest price and retry.';
    case 'insufficient_balance':
      return 'The agent wallet has insufficient CSPR balance to complete this payment.';
    case 'daily_limit_exceeded':
      return 'The agent wallet daily spending limit has been reached.';
    case 'invalid_payload_structure':
      return 'The payment payload is malformed. Ensure it is a valid x402 JSON object.';
    default:
      return 'Payment verification failed. Check the error code for details.';
  }
}
