import { Router } from 'express';
import { pool } from '../db/index.js';
import {
  accountHashFromPublicKey,
  callContract,
  cl,
  getBalance,
  loadPrivateKey,
  signMessage,
  transferCSPR,
  verifySignature
} from '../services/casper.js';
import { checkAndUpdateLimit } from '../services/limits.js';
import { checkAndStoreNonce } from '../services/nonce.js';
import { getListing } from '../services/registry.js';
import { canonicalizePaymentPayload, parseX402Payload } from '../types.js';
import type { VerifyResponse, X402PaymentPayload } from '../types.js';

const router = Router();

// The facilitator's own wallet executes the real CSPR transfer to the provider
// (matching the roadmap's reference implementation, which signs with
// FACILITATOR_PRIVATE_KEY rather than the agent's key). This is a deliberate
// hackathon simplification: production would have agents pre-sign their own
// transfer and have the facilitator merely relay/broadcast it, so the
// facilitator never needs ANY wallet's private key. The agent's own balance is
// still checked below as a solvency signal even though it isn't the literal
// source of the transferred funds in this implementation.
const facilitatorPrivateKey = loadPrivateKey(process.env.FACILITATOR_PRIVATE_KEY_PATH!);
const PAYMENT_CONTRACT_HASH = process.env.PAYMENT_CONTRACT_HASH!;
const PROTOCOL_FEE_BPS = 50n; // mirrors the Payment contract's default fee, for the Postgres log only

router.post('/verify', async (req, res) => {
  const payment = parseX402Payload(req.body);
  if (!payment) {
    const body: VerifyResponse = { valid: false, error: 'invalid_payload_structure' };
    return res.status(400).json(body);
  }

  const { payload } = payment;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Step 2: expiry
  if (nowSeconds > payload.expires_at) {
    const body: VerifyResponse = { valid: false, error: 'payment_expired' };
    return res.status(402).json(body);
  }

  // Step 3: nonce replay protection
  const nonceOk = await checkAndStoreNonce(payload.nonce, payload.expires_at);
  if (!nonceOk) {
    const body: VerifyResponse = { valid: false, error: 'duplicate_nonce' };
    return res.status(402).json(body);
  }

  // Step 4: signature. Account hashes are one-way, so the payload must carry the
  // agent's public key; we first confirm it actually hashes to the claimed `from`
  // wallet, then verify the signature against that same public key.
  const claimedAccountHash = payload.from.replace(/^account-hash-/, '');
  const derivedAccountHash = accountHashFromPublicKey(payload.from_public_key);
  if (derivedAccountHash !== claimedAccountHash) {
    const body: VerifyResponse = { valid: false, error: 'public_key_mismatch' };
    return res.status(402).json(body);
  }
  const message = canonicalizePaymentPayload(payload);
  if (!verifySignature(message, payment.signature, payload.from_public_key)) {
    const body: VerifyResponse = { valid: false, error: 'invalid_signature' };
    return res.status(402).json(body);
  }

  // Step 4.5: price match. The payload specifies the amount, so a provider's
  // middleware can't trick the facilitator into authorizing more than the
  // listing's actual on-chain price - this is a free storage read, not a
  // transaction, so it costs no gas and adds no meaningful latency.
  const amount = BigInt(payload.amount);
  const listing = await getListing(payload.listing_id);
  if (!listing || !listing.is_active) {
    const body: VerifyResponse = { valid: false, error: 'listing_not_found' };
    return res.status(404).json(body);
  }
  if (listing.price_per_call !== amount) {
    const body: VerifyResponse = { valid: false, error: 'price_mismatch' };
    return res.status(402).json(body);
  }

  // Step 5: balance
  const balance = await getBalance(payload.from);
  if (balance < amount) {
    const body: VerifyResponse = { valid: false, error: 'insufficient_balance' };
    return res.status(402).json(body);
  }

  // Step 6: spending limit
  const limitCheck = await checkAndUpdateLimit(payload.from, amount);
  if (!limitCheck.allowed) {
    const body: VerifyResponse = { valid: false, error: 'daily_limit_exceeded' };
    return res.status(402).json(body);
  }

  // Step 7: initiate transfer + on-chain settlement, optimistically (not awaited).
  // Waiting for finality here would add 2-30s to every API call.
  settleInBackground(payload, amount).catch((err: unknown) => {
    console.error(`Background settlement failed for nonce ${payload.nonce}:`, err);
  });

  // Step 8: return a receipt immediately. The real tx_hash isn't known yet since
  // settlement is still in flight - "pending" is what the agent/provider see now.
  const receipt = {
    tx_hash: 'pending',
    settled_amount: payload.amount,
    facilitator_signature: signMessage(facilitatorPrivateKey, JSON.stringify({ nonce: payload.nonce, amount: payload.amount, timestamp: nowSeconds })),
    timestamp: nowSeconds
  };
  const body: VerifyResponse = { valid: true, receipt };
  return res.status(200).json(body);
});

async function settleInBackground(payload: X402PaymentPayload, amount: bigint): Promise<void> {
  const txHash = await transferCSPR(facilitatorPrivateKey, payload.to, amount);

  const protocolFee = (amount * PROTOCOL_FEE_BPS) / 10_000n;
  const netAmount = amount - protocolFee;

  // The transfer (real fund movement) and the settle_transaction call (on-chain
  // bookkeeping + reputation update) are two separate transactions. If the first
  // succeeds but the second fails, the funds DID move - the row must say so
  // honestly ('transfer_only') rather than claim full settlement.
  await pool.query(
    `INSERT INTO transactions
       (listing_id, agent_wallet, provider_wallet, gross_amount_motes, protocol_fee_motes, net_amount_motes, on_chain_tx_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'transfer_only')`,
    [payload.listing_id, payload.from, payload.to, amount.toString(), protocolFee.toString(), netAmount.toString(), txHash]
  );

  await callContract(
    PAYMENT_CONTRACT_HASH,
    'settle_transaction',
    {
      listing_id: cl.u64(payload.listing_id),
      agent_wallet: cl.accountKey(payload.from),
      provider_wallet: cl.accountKey(payload.to),
      gross_amount: cl.u512(amount)
    },
    facilitatorPrivateKey
  );

  await pool.query(`UPDATE transactions SET status = 'settled' WHERE on_chain_tx_hash = $1`, [txHash]);
}

export default router;
