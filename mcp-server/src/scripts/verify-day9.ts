/**
 * Day 9 Verification Script
 *
 * Tests all six MCP tools (search_apis, get_api_details, call_api,
 * check_balance, get_transaction_history, compare_providers) by
 * importing and calling their handlers directly.
 *
 * Run:  tsx src/scripts/verify-day9.ts
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
// Day 8 Tools
// ---------------------------------------------------------------------------

async function testSearchApis() {
  console.log('\n🔍  Tool 1: search_apis');
  const { handleSearchApis } = await import('../tools/search_apis.js');

  await step('rejects missing query', async () => {
    const result = await handleSearchApis({});
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  const listings = await step('returns listings matching "price"', async () => {
    const result = await handleSearchApis({ query: 'price' });
    const text = result.content[0]?.text ?? '';
    if (text.includes('No listings found')) {
      console.log(`         (no listings found — DB may not have price listings)`);
      return null;
    }
    if (!text.includes('listing_id')) throw new Error(`Response missing listing_id: ${text.slice(0, 200)}`);
    console.log(`         Found listings: ${text.split('listing_id').length - 1} result(s)`);
    return result;
  });

  await step('category filter works (PriceData)', async () => {
    const result = await handleSearchApis({ query: 'CSPR', category: 'PriceData' });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('listing_id') && !text.includes('No listings')) {
      throw new Error(`Unexpected response: ${text.slice(0, 200)}`);
    }
  });

  return listings;
}

async function testGetApiDetails() {
  console.log('\n📋  Tool 2: get_api_details');
  const { handleGetApiDetails } = await import('../tools/get_api_details.js');

  await step('rejects non-integer listing_id', async () => {
    const result = await handleGetApiDetails({ listing_id: 'abc' });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  await step('returns not-found for listing_id 9999', async () => {
    const result = await handleGetApiDetails({ listing_id: 9999 });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('not found')) throw new Error(`Expected not-found, got: ${text}`);
  });

  const details = await step('returns full details for listing_id 0', async () => {
    const result = await handleGetApiDetails({ listing_id: 0 });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Price per call')) throw new Error(`Missing price field: ${text.slice(0, 300)}`);
    if (!text.includes('Provider wallet')) throw new Error(`Missing provider wallet: ${text.slice(0, 300)}`);
    return result;
  });

  return details;
}

async function testCallApi() {
  console.log('\n💸  Tool 3: call_api');
  const { handleCallApi } = await import('../tools/call_api.js');

  await step('rejects missing listing_id', async () => {
    const result = await handleCallApi({});
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

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

  await step('handles check on listing_id 0', async () => {
    process.env.AGENT_WALLET_ADDRESS = AGENT_WALLET;
    const result = await handleCallApi({ listing_id: 0 });
    const text = result.content[0]?.text ?? '';
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
// Day 9 Tools
// ---------------------------------------------------------------------------

async function testCheckBalance() {
  console.log('\n💳  Tool 4: check_balance');
  const { handleCheckBalance } = await import('../tools/check_balance.js');

  await step('rejects malformed arguments', async () => {
    const result = await handleCheckBalance({ agent_wallet: 12345 });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  await step('checks balance using configured wallet (env)', async () => {
    process.env.AGENT_WALLET_ADDRESS = AGENT_WALLET;
    const result = await handleCheckBalance({});
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Agent Wallet Balance State')) throw new Error(`Unexpected layout: ${text}`);
    if (!text.includes(AGENT_WALLET)) throw new Error(`Wallet address not mentioned: ${text}`);
  });

  await step('checks balance using passed wallet argument', async () => {
    // Save original and clear it to test explicit argument
    const original = process.env.AGENT_WALLET_ADDRESS;
    delete process.env.AGENT_WALLET_ADDRESS;
    const result = await handleCheckBalance({ agent_wallet: AGENT_WALLET });
    process.env.AGENT_WALLET_ADDRESS = original;
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Agent Wallet Balance State')) throw new Error(`Unexpected layout: ${text}`);
    if (!text.includes(AGENT_WALLET)) throw new Error(`Wallet address not mentioned: ${text}`);
  });
}

async function testGetTransactionHistory() {
  console.log('\n📊  Tool 5: get_transaction_history');
  const { handleGetTransactionHistory } = await import('../tools/get_transaction_history.js');

  await step('rejects invalid limit parameter', async () => {
    const result = await handleGetTransactionHistory({ limit: 999 }); // Max is 100
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  await step('fetches history and prints markdown table', async () => {
    process.env.AGENT_WALLET_ADDRESS = AGENT_WALLET;
    const result = await handleGetTransactionHistory({});
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Agent Transaction History') && !text.includes('No transactions found')) {
      throw new Error(`Unexpected layout: ${text}`);
    }
    console.log(`         Result output starts with: ${text.split('\n')[0]}`);
  });
}

async function testCompareProviders() {
  console.log('\n⚖️  Tool 6: compare_providers');
  const { handleCompareProviders } = await import('../tools/compare_providers.js');

  await step('rejects empty listing_ids', async () => {
    const result = await handleCompareProviders({ listing_ids: [] });
    const text = result.content[0]?.text ?? '';
    if (!text.includes('Invalid arguments')) throw new Error(`Expected validation error, got: ${text}`);
  });

  await step('compares multiple listings and outputs side-by-side table', async () => {
    const result = await handleCompareProviders({ listing_ids: [0, 9999] }); // 9999 will be missing
    const text = result.content[0]?.text ?? '';
    if (!text.includes('API Provider Comparison')) throw new Error(`Expected comparison header: ${text}`);
    if (!text.includes('Price per Call')) throw new Error(`Expected Price per Call attribute row: ${text}`);
    if (!text.includes('Listing ID(s) not found or inactive: `9999`')) {
      throw new Error(`Expected note about missing listing ID: ${text}`);
    }
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
  console.log('  AgentPay MCP Server — Day 9 Verification');
  console.log('═══════════════════════════════════════════════════════');

  console.log('\n🌐  Connectivity');
  await step('backend reachable', checkBackend);

  await testSearchApis();
  await testGetApiDetails();
  await testCallApi();
  await testCheckBalance();
  await testGetTransactionHistory();
  await testCompareProviders();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
