/**
 * Tool: search_apis
 *
 * Searches the AgentPay registry for APIs matching a query. Returns a ranked
 * list of matching listings, ranked by a composite score that weights reputation
 * tier (60%) and price (40%, cheaper = higher score). This matches the roadmap
 * specification exactly.
 *
 * The ranking ensures agents naturally prefer reputable, reasonably-priced
 * providers — exactly the market dynamic AgentPay is designed to create.
 */

import { z } from 'zod';
import { fetchListings } from '../services/registry.js';
import type { Listing, ReputationTier } from '../types.js';

// ---------------------------------------------------------------------------
// Tool definition (registered in index.ts)
// ---------------------------------------------------------------------------

export const searchApisTool = {
  name: 'search_apis' as const,
  description:
    'Search the AgentPay marketplace for APIs matching a query. Returns a ranked list ' +
    'of listings ordered by a composite score: 60% reputation tier and 40% price ' +
    '(cheaper APIs score higher on the price axis). Use this to discover what services ' +
    'are available before calling call_api.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language description of what you need (e.g. "CSPR price feed", "text summarizer")',
      },
      category: {
        type: 'string',
        enum: ['PriceData', 'Compute', 'Compliance', 'Document', 'Other'],
        description: 'Optional category filter',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default 10, max 50)',
      },
      min_reputation: {
        type: 'string',
        enum: ['New', 'Established', 'Trusted', 'Elite'],
        description: 'Minimum reputation tier filter',
      },
      max_price_motes: {
        type: 'string',
        description: 'Maximum price per call in motes (1 CSPR = 1,000,000,000 motes)',
      },
    },
    required: ['query'],
  },
};

// ---------------------------------------------------------------------------
// Argument schema (runtime validation)
// ---------------------------------------------------------------------------

const SearchApisArgs = z.object({
  query: z.string().min(1),
  category: z.enum(['PriceData', 'Compute', 'Compliance', 'Document', 'Other']).optional(),
  max_results: z.number().int().min(1).max(50).default(10),
  min_reputation: z.enum(['New', 'Established', 'Trusted', 'Elite']).optional(),
  max_price_motes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Ranking helpers
// ---------------------------------------------------------------------------

const TIER_RANK: Record<ReputationTier, number> = {
  New: 0,
  Established: 1,
  Trusted: 2,
  Elite: 3,
};

const TIER_MIN_RANK: Record<string, number> = {
  New: 0,
  Established: 1,
  Trusted: 2,
  Elite: 3,
};

/**
 * Ranks listings using a composite score:
 *   - Reputation tier contributes 60% (Elite=1.0, Trusted=0.67, Established=0.33, New=0.0)
 *   - Price contributes 40% (cheaper = higher score, normalized by the max price in the set)
 *
 * This is the formula specified in the roadmap and architecture docs.
 */
function rankListings(listings: Listing[]): Listing[] {
  if (listings.length === 0) return [];

  // Normalize price: find max price in the set, then score = 1 - (price / maxPrice)
  const prices = listings.map((l) => BigInt(l.price_motes));
  const maxPrice = prices.reduce((a, b) => (a > b ? a : b), 1n); // avoid division by zero

  const scored = listings.map((listing, i) => {
    const tierScore = TIER_RANK[listing.reputation_tier ?? 'New'] / 3; // 0–1
    const priceScore = maxPrice > 0n ? Number(maxPrice - prices[i]!) / Number(maxPrice) : 1; // 0–1, cheaper is better

    const composite = tierScore * 0.6 + priceScore * 0.4;
    return { listing, composite };
  });

  scored.sort((a, b) => b.composite - a.composite);
  return scored.map((s) => s.listing);
}

/**
 * Simple keyword search: returns true if the listing's name or description
 * contains any of the query words (case-insensitive). The description field is
 * especially important because it's written for AI agents to read — providers
 * are instructed to use natural language that matches what agents search for.
 */
function matchesQuery(listing: Listing, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const target = `${listing.name} ${listing.description}`.toLowerCase();
  return words.some((word) => target.includes(word));
}

function motesToCspr(motes: string): string {
  const n = BigInt(motes);
  const whole = n / 1_000_000_000n;
  const frac = n % 1_000_000_000n;
  if (frac === 0n) return `${whole} CSPR`;
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}.${fracStr} CSPR`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleSearchApis(args: unknown): Promise<{ content: { type: string; text: string }[] }> {
  const parsed = SearchApisArgs.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
    };
  }

  const { query, category, max_results, min_reputation, max_price_motes } = parsed.data;

  // Fetch from backend (Postgres mirror, paginated to 1000 for client-side filtering)
  const result = await fetchListings({ category, limit: 1000 });
  let listings = result.listings;

  // Keyword filter
  listings = listings.filter((l) => matchesQuery(l, query));

  // Min reputation filter
  if (min_reputation) {
    const minRank = TIER_MIN_RANK[min_reputation] ?? 0;
    listings = listings.filter((l) => TIER_RANK[l.reputation_tier ?? 'New'] >= minRank);
  }

  // Max price filter
  if (max_price_motes) {
    const maxPrice = BigInt(max_price_motes);
    listings = listings.filter((l) => BigInt(l.price_motes) <= maxPrice);
  }

  // Rank and truncate
  const ranked = rankListings(listings).slice(0, max_results);

  if (ranked.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No listings found matching "${query}"${category ? ` in category ${category}` : ''}. Try a broader query or remove filters.`,
        },
      ],
    };
  }

  const lines: string[] = [
    `Found ${ranked.length} listing${ranked.length === 1 ? '' : 's'} matching "${query}":`,
    '',
  ];

  for (let i = 0; i < ranked.length; i++) {
    const l = ranked[i]!;
    lines.push(`**${i + 1}. ${l.name}** (listing_id: ${l.listing_id})`);
    lines.push(`   📋 ${l.description}`);
    lines.push(`   💰 Price: ${motesToCspr(l.price_motes)} per call`);
    lines.push(`   ⭐ Reputation: ${l.reputation_tier ?? 'New'} | Calls served: ${l.total_calls ?? '0'}`);
    lines.push(`   🏷️  Category: ${l.category}`);
    lines.push(`   🔗 Endpoint: ${l.endpoint_url}`);
    lines.push('');
  }

  lines.push(`To call one of these APIs, use the call_api tool with the listing_id.`);
  lines.push(`For full details and transaction history, use get_api_details.`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
