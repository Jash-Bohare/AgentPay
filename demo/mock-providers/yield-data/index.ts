/**
 * Mock Provider 2 — Casper DeFi Yield Data
 *
 * Port: 3011
 * Endpoint: POST /yield  (MCP sends POST with X-Payment header)
 * Response: { protocols[], updated_at }
 *
 * Returns mock APY data for Casper DeFi protocols. In production this would
 * aggregate on-chain staking data; here we return plausible mocked rates to
 * demonstrate that AgentPay works for data-feed services beyond just price feeds.
 *
 * Protected by agentPayMiddleware.
 */

import 'dotenv/config';
import express from 'express';
import { agentPayMiddleware } from '../../../middleware/src/index.js';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.YIELD_DATA_PORT ?? 3011);
const LISTING_ID = Number(process.env.YIELD_DATA_LISTING_ID ?? 0);
const PROVIDER_WALLET = process.env.PROVIDER_WALLET ?? '';
const FACILITATOR_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';
const PRICE_MOTES = process.env.YIELD_DATA_PRICE_MOTES ?? '300000000'; // 0.3 CSPR

// ---------------------------------------------------------------------------
// Mock yield data (refreshed on each request with minor jitter to look real)
// ---------------------------------------------------------------------------

function jitter(base: number, pct: number): number {
  const delta = base * pct * (Math.random() * 2 - 1);
  return Math.round((base + delta) * 100) / 100;
}

function getYieldData() {
  return {
    protocols: [
      {
        name: 'Casper Native Staking',
        type: 'Proof-of-Stake Delegation',
        apy_pct: jitter(10.5, 0.05),
        min_stake_cspr: 500,
        lock_period_days: 14,
        risk: 'Low',
        description: 'Delegate CSPR to validators and earn staking rewards.',
      },
      {
        name: 'CasperSwap LP Pool (CSPR/USDC)',
        type: 'Automated Market Maker',
        apy_pct: jitter(24.3, 0.10),
        min_stake_cspr: 100,
        lock_period_days: 0,
        risk: 'Medium',
        description: 'Provide liquidity to the CSPR/USDC pool and earn trading fees.',
      },
      {
        name: 'Casper Lending Protocol',
        type: 'Decentralised Lending',
        apy_pct: jitter(8.7, 0.08),
        min_stake_cspr: 50,
        lock_period_days: 0,
        risk: 'Low-Medium',
        description: 'Deposit CSPR as collateral and earn lending interest.',
      },
      {
        name: 'CasperFarm CSPR Vault',
        type: 'Yield Aggregator',
        apy_pct: jitter(31.2, 0.15),
        min_stake_cspr: 1000,
        lock_period_days: 30,
        risk: 'High',
        description: 'Auto-compounding vault that cycles CSPR across multiple DeFi strategies.',
      },
    ],
    network: 'casper-test',
    updated_at: new Date().toISOString(),
    disclaimer: 'Mock data for demonstration purposes. Not financial advice.',
  };
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    service: 'Casper DeFi Yield Data',
    listing_id: LISTING_ID,
    price_motes: PRICE_MOTES,
    status: 'ok',
  });
});

// ---------------------------------------------------------------------------
// Paid endpoint — POST /yield
// ---------------------------------------------------------------------------

const paymentGuard = agentPayMiddleware({
  listing_id: LISTING_ID,
  provider_wallet: PROVIDER_WALLET,
  facilitator_url: FACILITATOR_URL,
  expected_price_motes: PRICE_MOTES,
});

app.post('/yield', paymentGuard, (_req, res) => {
  res.json(getYieldData());
});

app.get('/yield', paymentGuard, (_req, res) => {
  res.json(getYieldData());
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`✅ DeFi Yield Data running on port ${PORT}  (listing_id: ${LISTING_ID})`);
});
