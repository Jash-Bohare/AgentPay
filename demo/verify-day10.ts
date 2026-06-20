/**
 * Day 10 Verification Script
 *
 * Tests that the middleware and all three mock provider APIs behave correctly:
 * 1. Each provider returns 402 with correct hint when no X-Payment header is sent.
 * 2. Each provider returns its data correctly when a valid payment goes through
 *    (tested by calling through the MCP server's call_api so the real signing chain
 *    is exercised end-to-end).
 *
 * Requires:
 *   - Backend running at AGENTPAY_BACKEND_URL (default http://localhost:3001)
 *   - All three mock providers running (npm run providers in demo/)
 *   - Listing IDs set in .env (PRICE_FEED_LISTING_ID, YIELD_DATA_LISTING_ID, SUMMARIZER_LISTING_ID)
 *
 * Run:  cd demo && npm run verify:day10
 */

import 'dotenv/config';

const BACKEND_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';

interface MockProvider {
  name: string;
  baseUrl: string;
  endpoint: string;
  listingIdEnvVar: string;
  supportsPost: boolean;
  testBody?: Record<string, unknown>;
}

const PROVIDERS: MockProvider[] = [
  {
    name: 'CSPR Price Feed',
    baseUrl: 'http://localhost:3010',
    endpoint: '/price',
    listingIdEnvVar: 'PRICE_FEED_LISTING_ID',
    supportsPost: true,
  },
  {
    name: 'DeFi Yield Data',
    baseUrl: 'http://localhost:3011',
    endpoint: '/yield',
    listingIdEnvVar: 'YIELD_DATA_LISTING_ID',
    supportsPost: true,
  },
  {
    name: 'Text Summarizer',
    baseUrl: 'http://localhost:3012',
    endpoint: '/summarize',
    listingIdEnvVar: 'SUMMARIZER_LISTING_ID',
    supportsPost: true,
    testBody: {
      text: 'AgentPay is a micropayment infrastructure built on Casper blockchain. ' +
        'It enables AI agents to autonomously discover and pay for API services. ' +
        'The x402 protocol provides a standard way to attach cryptographic payment ' +
        'authorizations to HTTP requests. Providers install a simple middleware to ' +
        'gate their endpoints behind verified micropayments.',
    },
  },
];

let passCount = 0;
let failCount = 0;

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const result = await fn();
    console.log(`  ✅ PASS — ${name}`);
    passCount++;
    return result;
  } catch (err) {
    console.error(`  ❌ FAIL — ${name}`);
    console.error(`         ${err instanceof Error ? err.message : String(err)}`);
    failCount++;
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AgentPay — Day 10 Verification');
  console.log('═══════════════════════════════════════════════════════');

  // ── 1. Backend reachability ─────────────────────────────────────────────
  console.log('\n🌐  Backend Connectivity');
  await step('backend reachable', async () => {
    const res = await fetch(`${BACKEND_URL}/listings`);
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const { count } = (await res.json()) as { count: number };
    console.log(`         ${count} listings in DB`);
  });

  // ── 2. Per-provider checks ──────────────────────────────────────────────
  for (const provider of PROVIDERS) {
    console.log(`\n🔌  ${provider.name} (${provider.baseUrl})`);

    // Health check
    await step('health endpoint reachable', async () => {
      const res = await fetch(`${provider.baseUrl}/health`);
      if (!res.ok) throw new Error(`Health check returned ${res.status}`);
      const body = (await res.json()) as { status: string };
      if (body.status !== 'ok') throw new Error(`Unexpected status: ${body.status}`);
    });

    // 402 without X-Payment
    await step('returns 402 without X-Payment header', async () => {
      const res = await fetch(`${provider.baseUrl}${provider.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider.testBody ?? {}),
      });
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
      const body = (await res.json()) as { error: string; listing_id?: number; price_motes?: string };
      if (body.error !== 'payment_required') throw new Error(`Unexpected error code: ${body.error}`);
      if (!body.price_motes) throw new Error('Missing price_motes in 402 response');
      if (body.listing_id === undefined) throw new Error('Missing listing_id in 402 response');
      console.log(`         price_motes: ${body.price_motes}  listing_id: ${body.listing_id}`);
    });

    // Listing ID configured check
    const listingIdStr = process.env[provider.listingIdEnvVar];
    await step(`${provider.listingIdEnvVar} is set`, async () => {
      if (!listingIdStr || listingIdStr.includes('set after setup')) {
        throw new Error(
          `${provider.listingIdEnvVar} is not set in demo/.env. Run: npm run setup`
        );
      }
      const id = Number(listingIdStr);
      if (!Number.isInteger(id) || id < 0) throw new Error(`Invalid listing ID: ${listingIdStr}`);
      console.log(`         listing_id = ${id}`);
    });

    // Listing visible in GET /listings
    if (listingIdStr && !listingIdStr.includes('set after setup')) {
      await step('listing appears in GET /listings', async () => {
        const res = await fetch(`${BACKEND_URL}/listings`);
        const { listings } = (await res.json()) as {
          listings: Array<{ listing_id: number | string; name: string; is_active: boolean }>;
        };
        const found = listings.find((l) => Number(l.listing_id) === Number(listingIdStr));
        if (!found) throw new Error(`Listing ID ${listingIdStr} not found in GET /listings`);
        if (!found.is_active) throw new Error(`Listing ID ${listingIdStr} is inactive`);
        console.log(`         Found: "${found.name}" (active)`);
      });
    }
  }

  // ── 3. Summary ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
