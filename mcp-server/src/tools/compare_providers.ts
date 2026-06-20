/**
 * Tool: compare_providers
 *
 * Compares multiple API listings side-by-side by displaying their pricing,
 * reputation metrics, category, endpoint, and description in a single table.
 */

import { z } from 'zod';
import { fetchListing, fetchProviderScore } from '../services/registry.js';
import type { Listing, ProviderScore } from '../types.js';

// ---------------------------------------------------------------------------
// Tool definition (registered in index.ts)
// ---------------------------------------------------------------------------

export const compareProvidersTool = {
  name: 'compare_providers' as const,
  description:
    'Compare multiple API listings side-by-side to compare prices, reputation tiers, ' +
    'calls served, categories, and descriptions. Helps in selecting the best provider.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      listing_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of listing IDs to compare',
      },
    },
    required: ['listing_ids'],
  },
};

// ---------------------------------------------------------------------------
// Argument schema
// ---------------------------------------------------------------------------

const CompareProvidersArgs = z.object({
  listing_ids: z.array(z.number().int().nonnegative()).min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

export async function handleCompareProviders(args: unknown): Promise<{ content: { type: string; text: string }[] }> {
  const parsed = CompareProvidersArgs.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
    };
  }

  const { listing_ids } = parsed.data;

  // Fetch all listings in parallel
  const fetchPromises = listing_ids.map(async (id) => {
    const listing = await fetchListing(id);
    if (!listing) return { id, listing: null, score: null };

    const score = await fetchProviderScore(listing.provider_wallet);
    return { id, listing, score };
  });

  const results = await Promise.all(fetchPromises);

  const foundResults = results.filter((r) => r.listing !== null) as {
    id: number;
    listing: Listing;
    score: ProviderScore | null;
  }[];

  if (foundResults.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `None of the requested listing IDs (${listing_ids.join(', ')}) were found or active.`,
        },
      ],
    };
  }

  const lines = [
    `⚖️ **API Provider Comparison**`,
    `Comparing ${foundResults.length} API provider(s):`,
    '',
    `| Attribute | ` + foundResults.map((r) => `**${r.listing.name}**`).join(' | ') + ' |',
    `| :--- | ` + foundResults.map(() => ':---').join(' | ') + ' |',
    `| **Listing ID** | ` + foundResults.map((r) => `\`${r.listing.listing_id}\``).join(' | ') + ' |',
    `| **Price per Call** | ` + foundResults.map((r) => motesToCspr(r.listing.price_motes)).join(' | ') + ' |',
    `| **Reputation Tier** | ` + foundResults.map((r) => `\`${r.score?.reputation_tier ?? r.listing.reputation_tier ?? 'New'}\``).join(' | ') + ' |',
    `| **Total Calls Served** | ` + foundResults.map((r) => r.score?.total_calls_served ?? r.listing.total_calls ?? '0').join(' | ') + ' |',
    `| **Category** | ` + foundResults.map((r) => r.listing.category).join(' | ') + ' |',
    `| **Endpoint URL** | ` + foundResults.map((r) => `\`${r.listing.endpoint_url}\``).join(' | ') + ' |',
    `| **Description** | ` + foundResults.map((r) => r.listing.description).join(' | ') + ' |',
  ];

  // If some requested listings were not found, list them at the bottom
  const missing = results.filter((r) => r.listing === null).map((r) => r.id);
  if (missing.length > 0) {
    lines.push('');
    lines.push(`⚠️ **Note**: Listing ID(s) not found or inactive: ${missing.map((id) => `\`${id}\``).join(', ')}`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
