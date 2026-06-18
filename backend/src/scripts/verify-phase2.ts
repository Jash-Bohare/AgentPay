import '../env.js';
import { pool } from '../db/index.js';
import { loadPrivateKey, signMessage } from '../services/casper.js';
import { getListing } from '../services/registry.js';
import { canonicalizePaymentPayload } from '../types.js';
import type { X402Payload, X402PaymentPayload, VerifyResponse } from '../types.js';

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;
const AGENT_ACCOUNT_HASH = 'f6df2b9fc09d2b5f25af65faf36bc3bc4a6537597cc0181f9a2e1458cde387e3';
const AGENT_PUBLIC_KEY = '020321fe7f5a50f2e387e981a70535157b2a1d6645e82f1cd5aa0dde152cee946c0e';
const PROVIDER_ACCOUNT_HASH = '832467189c656e3a73531b63f401480bf9f1e72b00f449c6177d252556d127ff';

const agentPrivateKey = loadPrivateKey('../keys/agent_secret_key.pem');

function signPayload(payload: X402PaymentPayload): X402Payload {
  const message = canonicalizePaymentPayload(payload);
  return {
    protocol: 'x402',
    version: '1',
    scheme: 'casper-cspr',
    network: 'casper-test',
    payload,
    signature: signMessage(agentPrivateKey, message)
  };
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    console.log(`PASS - ${name}`);
    return result;
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  await pool.query(
    `INSERT INTO agent_limits (agent_wallet, daily_limit_motes, spent_today_motes, window_start)
     VALUES ($1, $2, 0, NOW())
     ON CONFLICT (agent_wallet) DO UPDATE SET daily_limit_motes = $2, spent_today_motes = 0, window_start = NOW()`,
    [AGENT_ACCOUNT_HASH, '50000000000']
  );

  const PRICE_MOTES = '3000000000'; // 3 CSPR - clears Casper's 2.5 CSPR native-transfer minimum

  // Step 1: POST /provider/register -> listing in Postgres AND on-chain
  const listingId = await step('1. POST /provider/register', async () => {
    const res = await fetch(`${BASE_URL}/provider/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phase 2 Integration Test API',
        description: 'Mock listing created by the Phase 2 integration test',
        endpoint_url: 'https://example.com/phase2-test',
        price_per_call: PRICE_MOTES,
        category: 'Compute',
        rate_limit_per_second: 5
      })
    });
    if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { listing_id: number };

    const onChain = await getListing(json.listing_id);
    if (!onChain || onChain.name !== 'Phase 2 Integration Test API') {
      throw new Error(`listing ${json.listing_id} not found on-chain after registration`);
    }
    const pg = await pool.query(`SELECT name FROM listings WHERE listing_id = $1`, [json.listing_id]);
    if (pg.rowCount === 0) throw new Error(`listing ${json.listing_id} not found in Postgres after registration`);

    console.log(`  listing_id: ${json.listing_id} (on-chain provider_wallet: ${onChain.provider_wallet})`);
    return json.listing_id;
  });

  // Step 2: POST /verify with a valid signed payment -> {valid:true} and CSPR moves
  const payload: X402PaymentPayload = {
    from: AGENT_ACCOUNT_HASH,
    from_public_key: AGENT_PUBLIC_KEY,
    to: PROVIDER_ACCOUNT_HASH,
    amount: PRICE_MOTES,
    listing_id: listingId,
    nonce: `phase2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expires_at: Math.floor(Date.now() / 1000) + 30,
    facilitator_url: BASE_URL
  };
  const signed = signPayload(payload);

  await step('2. POST /verify with valid payment -> valid:true', async () => {
    const res = await fetch(`${BASE_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed)
    });
    const json = (await res.json()) as VerifyResponse;
    if (res.status !== 200 || !json.valid) {
      throw new Error(`expected valid payment, got ${res.status}: ${JSON.stringify(json)}`);
    }
    console.log(`  receipt: ${JSON.stringify(json.receipt)}`);
  });

  // Step 3: GET /agent/:wallet/transactions -> the transaction appears. Poll
  // rather than sleep a fixed amount - background settlement (a native transfer
  // plus a settle_transaction contract call) can take anywhere from ~10-60s.
  await step('3. GET /agent/:wallet/transactions', async () => {
    const timeoutMs = 180_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${BASE_URL}/agent/${AGENT_ACCOUNT_HASH}/transactions`);
      const json = (await res.json()) as { transactions: { listing_id: number; status: string }[] };
      const match = json.transactions.find((t) => t.listing_id === listingId);
      if (match) {
        console.log(`  found transaction with status: ${match.status}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error(`no transaction found for listing ${listingId} within ${timeoutMs / 1000}s`);
  });

  // Step 4: GET /agent/:wallet/balance -> spent_today incremented
  await step('4. GET /agent/:wallet/balance', async () => {
    const res = await fetch(`${BASE_URL}/agent/${AGENT_ACCOUNT_HASH}/balance`);
    const json = (await res.json()) as { spent_today_motes: string; balance_motes: string };
    if (BigInt(json.spent_today_motes) < BigInt(PRICE_MOTES)) {
      throw new Error(`expected spent_today_motes >= ${PRICE_MOTES}, got ${json.spent_today_motes}`);
    }
    console.log(`  balance_motes: ${json.balance_motes}, spent_today_motes: ${json.spent_today_motes}`);
  });

  // Step 5: replay the same payload -> {valid:false, error:"duplicate_nonce"}
  await step('5. Replay POST /verify -> duplicate_nonce', async () => {
    const res = await fetch(`${BASE_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed)
    });
    const json = (await res.json()) as VerifyResponse;
    if (res.status !== 402 || json.error !== 'duplicate_nonce') {
      throw new Error(`expected duplicate_nonce, got ${res.status}: ${JSON.stringify(json)}`);
    }
  });

  console.log('\nAll 5 Phase 2 integration steps passed.');
  await pool.end();
}

main();
