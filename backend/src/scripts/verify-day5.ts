import '../env.js';
import { createClient } from 'redis';
import { pool } from '../db/index.js';
import { checkAndStoreNonce } from '../services/nonce.js';
import { checkAndUpdateLimit } from '../services/limits.js';
import { getBalance, loadPrivateKey, signMessage, transferCSPR, verifySignature } from '../services/casper.js';

const DEPLOYER_ACCOUNT_HASH = '9b9cf2b2a7c891c8b28212ad3cac254149f67d3963f96b6351f42b71b9791555';
const AGENT_ACCOUNT_HASH = 'f6df2b9fc09d2b5f25af65faf36bc3bc4a6537597cc0181f9a2e1458cde387e3';

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
  await step('Postgres: tables reachable', async () => {
    const rows = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    const names = rows.rows.map((r) => r.table_name);
    for (const expected of ['listings', 'agent_limits', 'transactions', 'used_nonces']) {
      if (!names.includes(expected)) throw new Error(`missing table ${expected}`);
    }
  });

  await step('Redis: set/get round trip', async () => {
    const client = createClient({ url: process.env.REDIS_URL! });
    await client.connect();
    await client.set('agentpay:verify:day5', 'ok');
    const value = await client.get('agentpay:verify:day5');
    await client.del('agentpay:verify:day5');
    await client.quit();
    if (value !== 'ok') throw new Error(`expected 'ok', got ${value}`);
  });

  await step('casper.getBalance: deployer wallet has funds', async () => {
    const balance = await getBalance(DEPLOYER_ACCOUNT_HASH);
    console.log(`  deployer balance: ${balance} motes`);
    if (balance <= 0n) throw new Error('expected positive balance');
  });

  await step('casper.verifySignature: round trip with deployer key', async () => {
    const privateKey = loadPrivateKey('../keys/deployer_secret_key.pem');
    const message = JSON.stringify({ hello: 'agentpay', nonce: 'test-nonce-1' });
    const signatureHex = signMessage(privateKey, message);
    const publicKeyHex = privateKey.publicKey.toHex();

    const valid = verifySignature(message, signatureHex, publicKeyHex);
    if (!valid) throw new Error('expected valid signature to verify as true');

    const tampered = verifySignature(message + 'x', signatureHex, publicKeyHex);
    if (tampered) throw new Error('expected tampered message to fail verification');
  });

  await step('nonce.checkAndStoreNonce: first true, replay false', async () => {
    const nonce = `test-${Date.now()}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 30;
    const first = await checkAndStoreNonce(nonce, expiresAt);
    const second = await checkAndStoreNonce(nonce, expiresAt);
    if (!first) throw new Error('expected first check to be true');
    if (second) throw new Error('expected replay check to be false');
  });

  await step('limits.checkAndUpdateLimit: enforces daily cap', async () => {
    const testWallet = 'test-wallet-day5-verify';
    await pool.query('DELETE FROM agent_limits WHERE agent_wallet = $1', [testWallet]);
    await pool.query(
      'INSERT INTO agent_limits (agent_wallet, daily_limit_motes, spent_today_motes) VALUES ($1, $2, 0)',
      [testWallet, '1000000']
    );

    const first = await checkAndUpdateLimit(testWallet, 600_000n);
    if (!first.allowed) throw new Error('expected first spend to be allowed');
    if (first.remaining !== 400_000n) throw new Error(`expected remaining 400000, got ${first.remaining}`);

    const second = await checkAndUpdateLimit(testWallet, 600_000n);
    if (second.allowed) throw new Error('expected second spend to exceed limit and be rejected');

    const unconfigured = await checkAndUpdateLimit('never-configured-wallet', 1n);
    if (unconfigured.allowed) throw new Error('expected unconfigured wallet to be rejected by default');

    await pool.query('DELETE FROM agent_limits WHERE agent_wallet = $1', [testWallet]);
  });

  await step('casper.transferCSPR: real 2.5 CSPR transfer, deployer -> agent', async () => {
    // Casper enforces a 2.5 CSPR (2,500,000,000 motes) minimum on native transfers.
    const privateKey = loadPrivateKey('../keys/deployer_secret_key.pem');
    const before = await getBalance(AGENT_ACCOUNT_HASH);
    const txHash = await transferCSPR(privateKey, AGENT_ACCOUNT_HASH, 2_500_000_000n);
    console.log(`  transfer tx: ${txHash}`);
    console.log(`  agent balance before: ${before} motes (post-transfer balance takes a few seconds to confirm)`);
  });

  await pool.end();
}

main();
