/**
 * Mock Provider 1 — CSPR/USD Real-time Price Feed
 *
 * Port: 3010
 * Endpoint: POST /price  (MCP sends POST with X-Payment header)
 * Response: { price_usd, change_24h_pct, timestamp, source }
 *
 * Protected by agentPayMiddleware — requests without a valid X-Payment header
 * are rejected with 402. Valid payments flow through to the price handler.
 *
 * The price is fetched from CoinGecko's public API (no key required) and cached
 * for 30 seconds to avoid rate-limiting. Falls back to a hardcoded value if the
 * network request fails.
 */

import 'dotenv/config';
import express from 'express';
import { agentPayMiddleware } from '../../../middleware/src/index.js';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Config — read from env (set by the setup script / demo runner)
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PRICE_FEED_PORT ?? 3010);
const LISTING_ID = Number(process.env.PRICE_FEED_LISTING_ID ?? 0);
const PROVIDER_WALLET = process.env.PROVIDER_WALLET ?? '';
const FACILITATOR_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';
const PRICE_MOTES = process.env.PRICE_FEED_PRICE_MOTES ?? '500000000'; // 0.5 CSPR

// ---------------------------------------------------------------------------
// Price cache (30-second TTL to be kind to CoinGecko)
// ---------------------------------------------------------------------------

interface PriceCache {
  price_usd: number;
  change_24h_pct: number;
  cached_at: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL_MS = 30_000;

async function fetchCsprPrice(): Promise<{ price_usd: number; change_24h_pct: number }> {
  const now = Date.now();
  if (cache && now - cache.cached_at < CACHE_TTL_MS) {
    return { price_usd: cache.price_usd, change_24h_pct: cache.change_24h_pct };
  }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as {
      'casper-network'?: { usd?: number; usd_24h_change?: number };
    };
    const coin = data['casper-network'];
    if (!coin?.usd) throw new Error('Unexpected CoinGecko response shape');

    cache = {
      price_usd: coin.usd,
      change_24h_pct: Math.round((coin.usd_24h_change ?? 0) * 100) / 100,
      cached_at: now,
    };
    return { price_usd: cache.price_usd, change_24h_pct: cache.change_24h_pct };
  } catch {
    // Fallback: return last cached value or a hardcoded default
    const fallbackPrice = cache?.price_usd ?? 0.042;
    const fallbackChange = cache?.change_24h_pct ?? 0;
    return { price_usd: fallbackPrice, change_24h_pct: fallbackChange };
  }
}

// ---------------------------------------------------------------------------
// Health check (no payment required)
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    service: 'CSPR/USD Price Feed',
    listing_id: LISTING_ID,
    price_motes: PRICE_MOTES,
    status: 'ok',
  });
});

// ---------------------------------------------------------------------------
// Paid endpoint — POST /price
// ---------------------------------------------------------------------------

const paymentGuard = agentPayMiddleware({
  listing_id: LISTING_ID,
  provider_wallet: PROVIDER_WALLET,
  facilitator_url: FACILITATOR_URL,
  expected_price_motes: PRICE_MOTES,
});

app.post('/price', paymentGuard, async (req, res) => {
  const { price_usd, change_24h_pct } = await fetchCsprPrice();

  res.json({
    asset: 'CSPR',
    price_usd,
    change_24h_pct,
    currency: 'USD',
    timestamp: new Date().toISOString(),
    source: 'CoinGecko (via AgentPay mock provider)',
    payment_receipt_tx: req.paymentReceipt?.tx_hash ?? 'pending',
  });
});

// Also accept GET /price for browser testing
app.get('/price', paymentGuard, async (req, res) => {
  const { price_usd, change_24h_pct } = await fetchCsprPrice();

  res.json({
    asset: 'CSPR',
    price_usd,
    change_24h_pct,
    currency: 'USD',
    timestamp: new Date().toISOString(),
    source: 'CoinGecko (via AgentPay mock provider)',
    payment_receipt_tx: req.paymentReceipt?.tx_hash ?? 'pending',
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`✅ CSPR Price Feed running on port ${PORT}  (listing_id: ${LISTING_ID})`);
});
