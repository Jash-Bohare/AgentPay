/**
 * demo/setup.ts
 *
 * Registers all three mock provider APIs as listings in the AgentPay registry
 * by calling POST /provider/register on the backend. Run this once before
 * starting the mock providers.
 *
 * Usage:
 *   cd demo && npm run setup
 *
 * The script prints the assigned listing_id for each provider. Copy these IDs
 * into demo/.env so the mock servers can configure their middleware correctly.
 *
 * Prerequisites:
 *   - Backend running at AGENTPAY_BACKEND_URL (default http://localhost:3001)
 */

import 'dotenv/config';

const BACKEND_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

interface ProviderDef {
  name: string;
  description: string;
  endpoint_url: string;
  price_per_call: string;   // motes as string
  category: string;
  rate_limit_per_second: number;
  envVarPrefix: string;     // used in the .env hint printed at the end
}

const PROVIDERS: ProviderDef[] = [
  {
    name: 'CSPR/USD Real-time Price Feed',
    description:
      'Real-time CSPR to USD exchange rate sourced from CoinGecko. ' +
      'Updated every 30 seconds. Returns current price, 24h change percentage, ' +
      'and timestamp. Ideal for DeFi bots, portfolio trackers, and trading agents.',
    endpoint_url: 'http://localhost:3010/price',
    price_per_call: '500000000',   // 0.5 CSPR
    category: 'PriceData',
    rate_limit_per_second: 10,
    envVarPrefix: 'PRICE_FEED',
  },
  {
    name: 'Casper DeFi Yield Data',
    description:
      'Current APY rates for Casper DeFi protocols including native staking, ' +
      'AMM liquidity pools, lending, and yield aggregators. ' +
      'Aggregates data from major Casper DeFi protocols. ' +
      'Useful for yield-optimization agents and portfolio rebalancers.',
    endpoint_url: 'http://localhost:3011/yield',
    price_per_call: '300000000',   // 0.3 CSPR
    category: 'PriceData',
    rate_limit_per_second: 5,
    envVarPrefix: 'YIELD_DATA',
  },
  {
    name: 'AI Text Summarizer',
    description:
      'Extractive text summarization service. POST a block of text and receive ' +
      'a concise summary of the most important sentences. Supports adjustable ' +
      'summary length (1-10 sentences). Useful for content pipelines, research ' +
      'agents, and document processing workflows.',
    endpoint_url: 'http://localhost:3012/summarize',
    price_per_call: '1000000000',  // 1 CSPR
    category: 'Compute',
    rate_limit_per_second: 3,
    envVarPrefix: 'SUMMARIZER',
  },
];

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

async function registerProvider(provider: ProviderDef): Promise<number> {
  const res = await fetch(`${BACKEND_URL}/provider/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: provider.name,
      description: provider.description,
      endpoint_url: provider.endpoint_url,
      price_per_call: provider.price_per_call,
      category: provider.category,
      rate_limit_per_second: provider.rate_limit_per_second,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { listing_id: number };
  return json.listing_id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AgentPay Demo Setup — Registering Mock Providers');
  console.log(`  Backend: ${BACKEND_URL}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check backend is reachable
  try {
    const health = await fetch(`${BACKEND_URL}/listings`);
    if (!health.ok) throw new Error(`${health.status}`);
    const { count } = (await health.json()) as { count: number };
    console.log(`✅ Backend reachable — ${count} listings currently in DB\n`);
  } catch (err) {
    console.error(`❌ Cannot reach backend at ${BACKEND_URL}: ${String(err)}`);
    console.error('   Start the backend first: cd backend && npm run start\n');
    process.exit(1);
  }

  const results: Array<{ provider: ProviderDef; listing_id: number }> = [];

  for (const provider of PROVIDERS) {
    process.stdout.write(`Registering "${provider.name}"... `);
    try {
      const listing_id = await registerProvider(provider);
      console.log(`✅  listing_id: ${listing_id}`);
      results.push({ provider, listing_id });
    } catch (err) {
      console.error(`❌  FAILED: ${String(err)}`);
    }
  }

  if (results.length === 0) {
    console.error('\n❌ No providers registered. Check backend logs for details.');
    process.exit(1);
  }

  // ── Print the .env snippet ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Add the following to demo/.env:');
  console.log('═══════════════════════════════════════════════════════════');
  for (const { provider, listing_id } of results) {
    console.log(`${provider.envVarPrefix}_LISTING_ID=${listing_id}`);
  }

  // ── Verify via GET /listings ────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Verifying listings in GET /listings...');
  console.log('═══════════════════════════════════════════════════════════');
  const listRes = await fetch(`${BACKEND_URL}/listings`);
  const { listings, count } = (await listRes.json()) as {
    listings: Array<{ listing_id: number; name: string; price_motes: string; category: string }>;
    count: number;
  };
  console.log(`Total listings in DB: ${count}\n`);

  const registeredIds = new Set(results.map((r) => r.listing_id));
  for (const l of listings) {
    if (registeredIds.has(Number(l.listing_id))) {
      console.log(
        `  ✅  ID ${l.listing_id}  ${l.name}  |  ${
          (BigInt(l.price_motes) / 1_000_000_000n).toString()
        } CSPR  |  ${l.category}`
      );
    }
  }

  console.log('\n🎉  Setup complete! Start the mock providers with:');
  console.log('     cd demo && npm run providers\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
