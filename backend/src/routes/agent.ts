import { Router } from 'express';
import { pool } from '../db/index.js';
import { getBalance, loadPrivateKey, transferCSPR } from '../services/casper.js';

const router = Router();

const ACCOUNT_HASH_RE = /^(account-hash-)?[0-9a-f]{64}$/i;

// Sandbox faucet: sends 50 CSPR from the facilitator wallet to the agent wallet.
// This is a hackathon convenience — in production agents would fund themselves.
const TOPUP_AMOUNT_MOTES = 50_000_000_000n; // 50 CSPR

router.post('/agent/:wallet/topup', async (req, res) => {
  const wallet = req.params.wallet!;
  if (!ACCOUNT_HASH_RE.test(wallet)) {
    return res.status(400).json({ error: 'invalid_wallet' });
  }

  try {
    const facilitatorKey = loadPrivateKey(process.env.FACILITATOR_PRIVATE_KEY_PATH!);
    const txHash = await transferCSPR(facilitatorKey, wallet, TOPUP_AMOUNT_MOTES);
    return res.json({
      success: true,
      tx_hash: txHash,
      amount_motes: TOPUP_AMOUNT_MOTES.toString(),
      amount_cspr: '50',
      explorer_url: `https://testnet.cspr.live/transaction/${txHash}`,
    });
  } catch (err: any) {
    console.error('Top-up failed:', err);
    return res.status(500).json({ error: 'topup_failed', detail: err?.message });
  }
});

router.get('/agent/:wallet/balance', async (req, res) => {
  const wallet = req.params.wallet!;
  if (!ACCOUNT_HASH_RE.test(wallet)) {
    return res.status(400).json({ error: 'invalid_wallet' });
  }

  const onChainBalance = await getBalance(wallet);
  const limitRows = await pool.query<{ daily_limit_motes: string; spent_today_motes: string }>(
    `SELECT daily_limit_motes, spent_today_motes FROM agent_limits WHERE agent_wallet = $1`,
    [wallet]
  );
  const limit = limitRows.rows[0];

  return res.json({
    wallet,
    balance_motes: onChainBalance.toString(),
    daily_limit_motes: limit?.daily_limit_motes ?? null,
    spent_today_motes: limit?.spent_today_motes ?? '0'
  });
});

router.get('/agent/:wallet/transactions', async (req, res) => {
  const wallet = req.params.wallet!;
  if (!ACCOUNT_HASH_RE.test(wallet)) {
    return res.status(400).json({ error: 'invalid_wallet' });
  }
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const rows = await pool.query(
    `SELECT tx_id, listing_id, provider_wallet, gross_amount_motes, protocol_fee_motes, net_amount_motes, on_chain_tx_hash, status, created_at
     FROM transactions
     WHERE agent_wallet = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [wallet, limit, offset]
  );

  return res.json({ transactions: rows.rows, count: rows.rowCount });
});

export default router;
