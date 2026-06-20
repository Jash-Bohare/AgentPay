/**
 * Tool: get_transaction_history
 *
 * Fetches and displays a formatted transaction history log for the agent wallet,
 * complete with listing references, gross/net splits, and testnet block explorer links.
 */

import { z } from 'zod';
import { fetchAgentTransactions } from '../services/registry.js';

// ---------------------------------------------------------------------------
// Tool definition (registered in index.ts)
// ---------------------------------------------------------------------------

export const getTransactionHistoryTool = {
  name: 'get_transaction_history' as const,
  description:
    'Fetch the recent micropayment transaction history for an agent wallet. ' +
    'Displays gross amount, protocol fees, net amounts, and on-chain Casper transaction links.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      agent_wallet: {
        type: 'string',
        description: 'Optional Casper wallet address (account hash hex) to query. If omitted, uses the configured agent wallet.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (default 20, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Pagination offset (default 0)',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Argument schema
// ---------------------------------------------------------------------------

const GetTransactionHistoryArgs = z.object({
  agent_wallet: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
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

function truncateHash(hash: string): string {
  if (!hash) return '-';
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetTransactionHistory(args: unknown): Promise<{ content: { type: string; text: string }[] }> {
  const parsed = GetTransactionHistoryArgs.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
    };
  }

  const wallet = parsed.data.agent_wallet || process.env.AGENT_WALLET_ADDRESS;
  if (!wallet) {
    return {
      content: [
        {
          type: 'text',
          text: 'No wallet address configured or provided. Set AGENT_WALLET_ADDRESS in your environment or pass agent_wallet as an argument.',
        },
      ],
    };
  }

  const limit = parsed.data.limit ?? 20;
  const offset = parsed.data.offset ?? 0;

  const transactions = await fetchAgentTransactions(wallet, limit, offset);

  if (transactions.length === 0) {
    return {
      content: [{ type: 'text', text: `No transactions found for agent wallet \`${wallet}\`.` }],
    };
  }

  const lines = [
    `📊 **Agent Transaction History**`,
    `**Address**: \`${wallet}\``,
    `Showing recent transactions (limit: ${limit}, offset: ${offset}):`,
    '',
    `| ID | Listing ID | Gross Amount | Protocol Fee | Net Amount | Status | Created At | On-chain Link |`,
    `| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |`,
  ];

  for (const tx of transactions) {
    const gross = motesToCspr(tx.gross_amount_motes);
    const fee = motesToCspr(tx.protocol_fee_motes);
    const net = motesToCspr(tx.net_amount_motes);
    const date = new Date(tx.created_at).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    const hashLink = tx.on_chain_tx_hash
      ? `[${truncateHash(tx.on_chain_tx_hash)}](https://testnet.cspr.live/transaction/${tx.on_chain_tx_hash})`
      : '-';

    lines.push(
      `| ${tx.tx_id} | ${tx.listing_id} | ${gross} | ${fee} | ${net} | \`${tx.status}\` | ${date} | ${hashLink} |`
    );
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
