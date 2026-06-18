import '../env.js';
import { pool } from '../db/index.js';
import { accountHashFromPublicKey, loadPrivateKey, signMessage } from '../services/casper.js';
import { canonicalizePaymentPayload } from '../types.js';
import type { X402Payload, X402PaymentPayload, VerifyResponse } from '../types.js';
import casperSdkDefault from 'casper-js-sdk';
const casperSdk = casperSdkDefault as unknown as typeof import('casper-js-sdk');
const { PrivateKey, KeyAlgorithm } = casperSdk;

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;
const AGENT_ACCOUNT_HASH = 'f6df2b9fc09d2b5f25af65faf36bc3bc4a6537597cc0181f9a2e1458cde387e3';
const AGENT_PUBLIC_KEY = '020321fe7f5a50f2e387e981a70535157b2a1d6645e82f1cd5aa0dde152cee946c0e';
const PROVIDER_ACCOUNT_HASH = '832467189c656e3a73531b63f401480bf9f1e72b00f449c6177d252556d127ff';

const agentPrivateKey = loadPrivateKey('../keys/agent_secret_key.pem');

function buildPayload(overrides: Partial<X402PaymentPayload> = {}): X402PaymentPayload {
  return {
    from: AGENT_ACCOUNT_HASH,
    from_public_key: AGENT_PUBLIC_KEY,
    to: PROVIDER_ACCOUNT_HASH,
    // Casper enforces a 2.5 CSPR (2,500,000,000 motes) minimum on native transfers,
    // so that's the practical floor for a price-per-call that actually settles
    // on-chain via a plain transfer - see README for the implications on pricing.
    amount: '3000000000',
    listing_id: 1,
    nonce: `verify-day6-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expires_at: Math.floor(Date.now() / 1000) + 30,
    facilitator_url: BASE_URL,
    ...overrides
  };
}

function signPayload(payload: X402PaymentPayload, signerPrivateKey = agentPrivateKey): X402Payload {
  const message = canonicalizePaymentPayload(payload);
  return {
    protocol: 'x402',
    version: '1',
    scheme: 'casper-cspr',
    network: 'casper-test',
    payload,
    signature: signMessage(signerPrivateKey, message)
  };
}

async function postVerify(body: unknown): Promise<{ status: number; json: VerifyResponse }> {
  const res = await fetch(`${BASE_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = (await res.json()) as VerifyResponse;
  return { status: res.status, json };
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  // Ensure the agent wallet has a configured daily limit - without this, every
  // payment from it is rejected by design (see Day 5's limits.ts decision).
  await pool.query(
    `INSERT INTO agent_limits (agent_wallet, daily_limit_motes, spent_today_motes, window_start)
     VALUES ($1, $2, 0, NOW())
     ON CONFLICT (agent_wallet) DO UPDATE SET daily_limit_motes = $2, spent_today_motes = 0, window_start = NOW()`,
    [AGENT_ACCOUNT_HASH, '50000000000'] // 50 CSPR/day, plenty for this test
  );

  await step('Test 1 - missing fields -> invalid_payload_structure', async () => {
    const { status, json } = await postVerify({});
    if (status !== 400 || json.error !== 'invalid_payload_structure') {
      throw new Error(`expected 400/invalid_payload_structure, got ${status}/${json.error}`);
    }
  });

  await step('Test 2 - expired payment -> payment_expired', async () => {
    const payload = buildPayload({ expires_at: Math.floor(Date.now() / 1000) - 60 });
    const { status, json } = await postVerify(signPayload(payload));
    if (status !== 402 || json.error !== 'payment_expired') {
      throw new Error(`expected 402/payment_expired, got ${status}/${json.error}`);
    }
  });

  await step('Test 3 - bad signature -> invalid_signature', async () => {
    const payload = buildPayload();
    const signed = signPayload(payload);
    signed.signature = signed.signature.slice(0, -4) + '0000'; // corrupt the tail
    const { status, json } = await postVerify(signed);
    if (status !== 402 || json.error !== 'invalid_signature') {
      throw new Error(`expected 402/invalid_signature, got ${status}/${json.error}`);
    }
  });

  await step('Test 4 - insufficient balance -> insufficient_balance', async () => {
    const freshKey = PrivateKey.generate(KeyAlgorithm.SECP256K1); // never funded, guaranteed 0 balance
    const freshPublicKeyHex = freshKey.publicKey.toHex();
    const freshAccountHash = accountHashFromPublicKey(freshPublicKeyHex);
    const payload = buildPayload({ from: freshAccountHash, from_public_key: freshPublicKeyHex });
    const { status, json } = await postVerify(signPayload(payload, freshKey));
    if (status !== 402 || json.error !== 'insufficient_balance') {
      throw new Error(`expected 402/insufficient_balance, got ${status}/${json.error}`);
    }
  });

  await step('Test 5 - valid payment -> valid:true, then duplicate nonce rejected', async () => {
    const payload = buildPayload();
    const signed = signPayload(payload);

    const first = await postVerify(signed);
    if (first.status !== 200 || !first.json.valid) {
      throw new Error(`expected valid payment to succeed, got ${first.status}/${JSON.stringify(first.json)}`);
    }
    console.log(`  receipt: ${JSON.stringify(first.json.receipt)}`);

    const second = await postVerify(signed);
    if (second.status !== 402 || second.json.error !== 'duplicate_nonce') {
      throw new Error(`expected replay to be rejected, got ${second.status}/${second.json.error}`);
    }
  });

  await step('Test 6 - background settlement lands in Postgres', async () => {
    await new Promise((resolve) => setTimeout(resolve, 8000)); // give the background settlement time to land
    const rows = await pool.query<{ on_chain_tx_hash: string; status: string }>(
      `SELECT on_chain_tx_hash, status FROM transactions WHERE agent_wallet = $1 ORDER BY created_at DESC LIMIT 1`,
      [AGENT_ACCOUNT_HASH]
    );
    if (rows.rowCount === 0) throw new Error('expected a transactions row for the agent wallet');
    const row = rows.rows[0]!;
    console.log(`  settled tx: ${row.on_chain_tx_hash}, status: ${row.status}`);
    if (row.status !== 'settled') throw new Error(`expected status settled, got ${row.status}`);
  });

  await pool.end();
}

main();
