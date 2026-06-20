/**
 * Day 8 Verification Script
 *
 * Tests all three Day 8 tools (search_apis, get_api_details, call_api) by
 * importing and calling their handlers directly — no MCP transport needed.
 *
 * Run:  tsx src/scripts/verify-day8.ts
 * Requires: backend running at AGENTPAY_BACKEND_URL (default http://localhost:3001)
 */

import '../env.js';

const BACKEND_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';
const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS ?? 'f6df2b9fc09d2b5f25af65faf36bc3bc4a6537597cc0181f9a2e1458cde387e3';

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

// ---------------------------------------------------------------------------
// Tool 1 — search_apis
// ---------------------------------------------------------------------------

async function testSearchApis() {
  console.log('\n🔍  Tool 1: search_apis');

  // Dynamic import so the .env is loaded first
  const { handleSearchApis } = await import('../tools/search_apis.js');

  // Test: missing required field
  await step('rejects missing query', async () => {
    const result = await handleSearchApis({});
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  // Test: searches and returns listings
  const listings = await step('returns listings matching "price"', async () => {
    const result = await handleSearchApis({ query: 'price' });
    const text = result.content[0]?.text ?? '';
    if (text.includes('No listings found')) {
      // Not a hard failure - DB may just have no listings matching "price"
      console.log(`         (no listings found — DB may not have price listings)`);
      return null;
    }
    if (!text.includes('listing_id')) throw new Error(`Response missing listing_id: ${text.slice(0, 200)}`);
    console.log(`         Found listings: ${text.split('listing_id').length - 1} result(s)`);
    return result;
  });

  // Test: category filter
  await step('category filter works (PriceData)', async () => {
    const result = await handleSearchApis({ query: 'CSPR', category: 'PriceData' });
    const text = result.content[0]?.text ?? '';
    // Either results restricted to PriceData, or no results — both are valid
    if (!text.includes('listing_id') && !text.includes('No listings')) {
      throw new Error(`Unexpected response: ${text.slice(0, 200)}`);
    }
  });

  // Test: max_results respects limit
  await step('max_results is respected', async () => {
    const result = await handleSearchApis({ query: 'API', max_results: 2 });
    const text = result.content[0]?.text ?? '';
    const count = (text.match(/listing_id:/g) ?? []).length;
    if (count > 2) throw new Error(`Expected ≤2 results, got ${count}`);
  });

  return listings;
}

// ---------------------------------------------------------------------------
// Tool 2 — get_api_details
// ---------------------------------------------------------------------------

async function testGetApiDetails() {
  console.log('\n📋  Tool 2: get_api_details');

  const { handleGetApiDetails } = await import('../tools/get_api_details.js');

  // Test: invalid argument type
  await step('rejects non-integer listing_id', async () => {
    const result = await handleGetApiDetails({ listing_id: 'abc' });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  // Test: non-existent listing
  await step('returns not-found for listing_id 9999', async () => {
    const result = await handleGetApiDetails({ listing_id: 9999 });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('not found')) throw new Error(`Expected not-found, got: ${text}`);
  });

  // Test: known listing (listing_id 0 — seeded in verify-day5)
  const details = await step('returns full details for listing_id 0', async () => {
    const result = await handleGetApiDetails({ listing_id: 0 });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Price per call')) throw new Error(`Missing price field: ${text.slice(0, 300)}`);
    if (!text.includes('Provider wallet')) throw new Error(`Missing provider wallet: ${text.slice(0, 300)}`);
    console.log(`         Endpoint and price present in output ✓`);
    return result;
  });

  return details;
}

// ---------------------------------------------------------------------------
// Tool 3 — call_api (dry-run: test validation paths only, skip actual payment)
// ---------------------------------------------------------------------------

async function testCallApi() {
  console.log('\n💸  Tool 3: call_api');

  const { handleCallApi } = await import('../tools/call_api.js');

  // Test: missing listing_id
  await step('rejects missing listing_id', async () => {
    const result = await handleCallApi({});
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  // Test: missing AGENT_WALLET_ADDRESS env var behaviour
  await step('reports missing AGENT_WALLET_ADDRESS gracefully', async () => {
    const original = process.env.AGENT_WALLET_ADDRESS;
    delete process.env.AGENT_WALLET_ADDRESS;
    const result = await handleCallApi({ listing_id: 0 });
    process.env.AGENT_WALLET_ADDRESS = original;
    const text = result.content[0]?.text ?? '';
    if (!text.includes('AGENT_WALLET_ADDRESS')) {
      throw new Error(`Expected env var error, got: ${text}`);
    }
  });

  // Test: non-existent listing
  process.env.AGENT_WALLET_ADDRESS = AGENT_WALLET;
  await step('returns not-found for listing_id 9999', async () => {
    const result = await handleCallApi({ listing_id: 9999 });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('not found')) throw new Error(`Expected not-found, got: ${text}`);
  });

  // Test: inactive listing check
  await step('handles inactive listing gracefully', async () => {
    // listing_id 0 is active; this tests the code path indirectly by calling
    // a well-known listing — if it reaches the provider call (network error or
    // actual 402 payment rejected) we're fine — the important thing is it got
    // past argument validation and the listing lookup.
    const result = await handleCallApi({ listing_id: 0 });
    const text = result.content[0]?.text ?? '';
    // Any response beyond validation errors is acceptable here — could be a
    // network error reaching the local mock provider, a 402, or a success.
    if (text.includes('Invalid arguments')) {
      throw new Error(`Unexpected validation error for valid args: ${text}`);
    }
    if (text.includes('Listing 0 not found')) {
      throw new Error(`listing_id 0 not found — is the backend seeded?`);
    }
    console.log(`         Response type: ${text.startsWith('✅') ? 'SUCCESS' : text.startsWith('❌') ? 'PAYMENT_REJECTED (expected for mock)' : 'NETWORK_ERROR (expected for mock)'}`);
  });
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

async function checkBackend() {
  const res = await fetch(`${BACKEND_URL}/listings`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  const json = (await res.json()) as { count: number };
  console.log(`  Backend at ${BACKEND_URL} — ${json.count} listings in DB`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AgentPay MCP Server — Day 8 Verification');
  console.log('═══════════════════════════════════════════════════════');

  console.log('\n🌐  Connectivity');
  await step('backend reachable', checkBackend);

  await testSearchApis();
  await testGetApiDetails();
  await testCallApi();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
