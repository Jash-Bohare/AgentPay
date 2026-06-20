/**
 * Tool: get_api_details
 *
 * Returns full details for a specific listing: the complete Listing struct plus
 * the provider's reputation score. An agent uses this when it has already found
 * a candidate via search_apis and wants more information before committing to
 * calling it (e.g. to check uptime, accuracy, or historical call volume).
 */

import { z } from 'zod';
import { fetchListing, fetchProviderScore } from '../services/registry.js';

// ---------------------------------------------------------------------------
// Tool definition (registered in index.ts)
// ---------------------------------------------------------------------------

export const getApiDetailsTool = {
  name: 'get_api_details' as const,
  description:
    'Get full details for a specific API listing, including its description, price, ' +
    'endpoint URL, and the provider\'s reputation score (total calls served, success rate, ' +
    'reputation tier). Use this before calling an API if you want to assess its quality ' +
    'or verify the price.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      listing_id: {
        type: 'number',
        description: 'The numeric listing ID from search_apis results',
      },
    },
    required: ['listing_id'],
  },
};

// ---------------------------------------------------------------------------
// Argument schema
// ---------------------------------------------------------------------------

const GetApiDetailsArgs = z.object({
  listing_id: z.number().int().nonnegative(),
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

function successRate(served: string, successful: string): string {
  const s = BigInt(served);
  const ok = BigInt(successful);
  if (s === 0n) return 'N/A (no calls yet)';
  const pct = Number((ok * 100n) / s);
  return `${pct}%`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetApiDetails(args: unknown): Promise<{ content: { type: string; text: string }[] }> {
  const parsed = GetApiDetailsArgs.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
    };
  }

  const { listing_id } = parsed.data;

  const [listing, providerScore] = await Promise.all([
    fetchListing(listing_id),
    // We don't know the provider wallet until we have the listing; fetch listing first,
    // then the score. The Promise.all here fetches listing; score is fetched below.
    Promise.resolve(null),
  ]);

  if (!listing) {
    return {
      content: [{ type: 'text', text: `Listing ${listing_id} not found or is inactive.` }],
    };
  }

  // Now fetch the provider score with the known provider_wallet
  const score = await fetchProviderScore(listing.provider_wallet);

  const lines: string[] = [
    `## ${listing.name} (listing_id: ${listing.listing_id})`,
    '',
    `**Description**: ${listing.description}`,
    '',
    `### Pricing & Access`,
    `- **Price per call**: ${motesToCspr(listing.price_motes)} (${listing.price_motes} motes)`,
    `- **Category**: ${listing.category}`,
    `- **Endpoint**: ${listing.endpoint_url}`,
    `- **Status**: ${listing.is_active ? '✅ Active' : '❌ Inactive'}`,
    '',
    `### Provider Reputation`,
    `- **Provider wallet**: \`${listing.provider_wallet}\``,
  ];

  if (score) {
    lines.push(`- **Reputation tier**: ${score.reputation_tier}`);
    lines.push(`- **Total calls served**: ${score.total_calls_served}`);
    lines.push(`- **Success rate**: ${successRate(score.total_calls_served, score.successful_calls)}`);
    lines.push(`- **Uptime score**: ${score.uptime_score}/100`);
    lines.push(`- **Accuracy score**: ${score.accuracy_score}/100`);
  } else {
    lines.push(`- **Reputation tier**: New (no on-chain history yet)`);
    lines.push(`- **Total calls served**: 0`);
  }

  lines.push('');
  lines.push(
    `To call this API, use: \`call_api\` with \`listing_id: ${listing.listing_id}\` and your request body.`,
  );

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
