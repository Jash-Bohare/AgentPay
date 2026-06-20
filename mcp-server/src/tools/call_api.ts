/**
 * Tool: call_api
 *
 * The core tool of the MCP server. Makes an authenticated, paid API call to a
 * provider using the x402 micropayment protocol. From the agent's perspective,
 * it just calls an API and gets back data. The payment is completely invisible.
 *
 * Internal flow:
 *   1. Fetch the listing from the backend to get the endpoint URL and price
 *   2. Build the x402 payment payload (nonce, TTL, amounts, wallets)
 *   3. Sign the payload with the agent's private key (client-side — key never
 *      leaves the MCP server process)
 *   4. Send the HTTP request to the provider's endpoint with X-Payment header
 *   5. The provider middleware forwards the header to POST /verify on the backend
 *   6. If verified: provider returns the API response, CSPR moves on-chain
 *   7. Return the API response to the agent
 *
 * The agent sees steps 1 and 7. Steps 2–6 are invisible infrastructure.
 *
 * Key design decisions:
 * - We fetch the listing to validate price before signing (prevents stale price)
 * - The agent wallet env var is the source of the `from` field (not user-provided)
 *   so agents can't accidentally or maliciously pay from the wrong wallet
 * - request_body is passed through to the provider verbatim — the MCP server is
 *   not opinionated about the API's schema, just the payment layer
 */

import { z } from 'zod';
import { fetchListing } from '../services/registry.js';
import { callProviderApi } from '../services/payment.js';

// ---------------------------------------------------------------------------
// Tool definition (registered in index.ts)
// ---------------------------------------------------------------------------

export const callApiTool = {
  name: 'call_api' as const,
  description:
    'Make an authenticated, paid API call to an AgentPay provider. The x402 payment ' +
    'is handled automatically — the agent\'s wallet signs the payment authorization ' +
    'and CSPR moves from the agent wallet to the provider wallet. The payment is ' +
    'invisible; you just get back the API response data. ' +
    'IMPORTANT: This tool costs real CSPR from the configured agent wallet. ' +
    'Verify the listing price with get_api_details before calling if unsure.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      listing_id: {
        type: 'number',
        description: 'The listing ID from search_apis or get_api_details',
      },
      request_body: {
        type: 'object',
        description: 'The JSON body to send to the provider API (optional — some APIs have no body)',
        additionalProperties: true,
      },
      request_headers: {
        type: 'object',
        description: 'Additional HTTP headers to include in the request (optional)',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['listing_id'],
  },
};

// ---------------------------------------------------------------------------
// Argument schema
// ---------------------------------------------------------------------------

const CallApiArgs = z.object({
  listing_id: z.number().int().nonnegative(),
  request_body: z.record(z.string(), z.unknown()).optional(),
  request_headers: z.record(z.string(), z.string()).optional(),
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

export async function handleCallApi(args: unknown): Promise<{ content: { type: string; text: string }[] }> {
  const parsed = CallApiArgs.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
    };
  }

  const { listing_id, request_body, request_headers } = parsed.data;

  // The agent wallet must be configured — this is the wallet that pays
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  if (!agentWallet) {
    return {
      content: [
        {
          type: 'text',
          text: 'AGENT_WALLET_ADDRESS is not set. Configure it in the MCP server environment before making payments.',
        },
      ],
    };
  }

  // Step 1: Fetch listing to get current price and endpoint
  const listing = await fetchListing(listing_id);
  if (!listing) {
    return {
      content: [{ type: 'text', text: `Listing ${listing_id} not found or is inactive.` }],
    };
  }

  if (!listing.is_active) {
    return {
      content: [{ type: 'text', text: `Listing ${listing_id} (${listing.name}) is currently inactive.` }],
    };
  }

  // Steps 2–6: Sign and send (handled by the payment service)
  const callOptions: Parameters<typeof callProviderApi>[0] = {
    listing,
    agentWalletHash: agentWallet,
  };
  if (request_body !== undefined) callOptions.requestBody = request_body;
  if (request_headers !== undefined) callOptions.requestHeaders = request_headers;
  const result = await callProviderApi(callOptions);

  if (!result.success) {
    const lines: string[] = [
      `❌ API call failed (HTTP ${result.httpStatus})`,
      '',
      `**Listing**: ${listing.name} (ID: ${listing.listing_id})`,
      `**Error**: ${result.error ?? 'Unknown error'}`,
    ];

    if (result.httpStatus === 402) {
      lines.push('');
      lines.push(
        '💡 Payment was rejected. Common causes: insufficient CSPR balance, daily limit exceeded, ' +
          'or payment authorization expired. Check your balance with check_balance.',
      );
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  const lines: string[] = [
    `✅ API call successful — paid ${motesToCspr(listing.price_motes)} CSPR`,
    '',
    `**Provider**: ${listing.name}`,
    `**Listing ID**: ${listing.listing_id}`,
    '',
    '**Response**:',
  ];

  const responseText =
    typeof result.data === 'string'
      ? result.data
      : JSON.stringify(result.data, null, 2);

  lines.push('```json');
  lines.push(responseText);
  lines.push('```');

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
