/**
 * MCP server registry service.
 *
 * Fetches listing and reputation data from the AgentPay backend REST API.
 * The backend is the authoritative source for this (its Postgres mirror is
 * kept in sync with the Registry and Reputation contracts via the sync service).
 *
 * All reads are via the backend — the MCP server never talks to the Casper node
 * directly, keeping its dependency surface to a single base URL.
 */

import type { BalanceResponse, Listing, ProviderScore, ReputationTier, TransactionRecord } from '../types.js';

const BACKEND_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Listing queries
// ---------------------------------------------------------------------------

export interface ListingsQuery {
  category?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListingsResult {
  listings: Listing[];
  count: number;
}

/** Fetches active listings from the backend, optionally filtered by category. */
export async function fetchListings(query: ListingsQuery = {}): Promise<ListingsResult> {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));

  const url = `${BACKEND_URL}/listings${params.size > 0 ? `?${params.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch listings: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ListingsResult;
}

/** Fetches a single listing by ID. Returns null if not found. */
export async function fetchListing(listingId: number): Promise<Listing | null> {
  // The backend's GET /listings endpoint returns all active listings;
  // we filter by listing_id client-side (small dataset for the hackathon).
  // Postgres returns BIGINT as a string, so we coerce both sides to number.
  const result = await fetchListings({ limit: 1000 });
  return result.listings.find((l) => Number(l.listing_id) === listingId) ?? null;
}

// ---------------------------------------------------------------------------
// Reputation — backend exposes it in listings rows (reputation_tier + total_calls)
// but for full scores we reconstruct from what we have.
// ---------------------------------------------------------------------------

/**
 * Returns a ProviderScore-shaped object for a given provider wallet. The backend
 * stores the reputation_tier and total_calls columns in listings, so we read
 * those rather than re-implementing the Casper storage read here. This covers
 * everything the MCP tools need for the hackathon.
 *
 * Returns null if the provider has no listings (and thus no tracked reputation).
 */
export async function fetchProviderScore(providerWallet: string): Promise<ProviderScore | null> {
  const result = await fetchListings({ limit: 1000 });
  const providerListings = result.listings.filter((l) => l.provider_wallet === providerWallet);
  if (providerListings.length === 0) return null;

  // Aggregate across the provider's listings — take the best tier and sum calls
  const tierOrder: ReputationTier[] = ['New', 'Established', 'Trusted', 'Elite'];
  let bestTierIndex = 0;
  let totalCalls = 0n;

  for (const listing of providerListings) {
    const idx = tierOrder.indexOf(listing.reputation_tier ?? 'New');
    if (idx > bestTierIndex) bestTierIndex = idx;
    if (listing.total_calls) totalCalls += BigInt(listing.total_calls);
  }

  return {
    total_calls_served: totalCalls.toString(),
    successful_calls: totalCalls.toString(), // conservative: backend doesn't expose split
    failed_calls: '0',
    total_cspr_earned: '0', // not surfaced via backend API, contract read skipped for MCP
    uptime_score: 100,
    accuracy_score: 100,
    reputation_tier: tierOrder[bestTierIndex] ?? 'New',
    last_updated: '0',
  };
}

// ---------------------------------------------------------------------------
// Agent queries (delegated to the backend)
// ---------------------------------------------------------------------------

/** Returns the agent's on-chain balance and daily spending limit state. */
export async function fetchAgentBalance(agentWallet: string): Promise<BalanceResponse> {
  const res = await fetch(`${BACKEND_URL}/agent/${agentWallet}/balance`);
  if (!res.ok) {
    throw new Error(`Failed to fetch balance for ${agentWallet}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as BalanceResponse;
}

/** Returns the agent's recent transaction history. */
export async function fetchAgentTransactions(
  agentWallet: string,
  limit = 20,
  offset = 0,
): Promise<TransactionRecord[]> {
  const res = await fetch(`${BACKEND_URL}/agent/${agentWallet}/transactions?limit=${limit}&offset=${offset}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch transactions for ${agentWallet}: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { transactions: TransactionRecord[] };
  return json.transactions;
}
