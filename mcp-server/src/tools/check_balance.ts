/**
 * Tool: check_balance
 *
 * Exposes account checking for the configured agent wallet or a provided
 * target wallet. Returns on-chain CSPR balance combined with local postgres-cached
 * daily spend limit metrics (total limit, spent today, remaining today).
 */

import { z } from 'zod';
import { fetchAgentBalance } from '../services/registry.js';

// ---------------------------------------------------------------------------
// Tool definition (registered in index.ts)
// ---------------------------------------------------------------------------

export const checkBalanceTool = {
  name: 'check_balance' as const,
  description:
    'Check the Casper network CSPR balance and daily spending limits of an agent wallet. ' +
    'By default, checks the wallet configured in the AGENT_WALLET_ADDRESS environment variable.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      agent_wallet: {
        type: 'string',
        description: 'Optional Casper wallet address (account hash hex) to query. If omitted, uses the configured agent wallet.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Argument schema
// ---------------------------------------------------------------------------

const CheckBalanceArgs = z.object({
  agent_wallet: z.string().optional(),
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

export async function handleCheckBalance(args: unknown): Promise<{ content: { type: string; text: string }[] }> {
  const parsed = CheckBalanceArgs.safeParse(args);
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

  const balanceInfo = await fetchAgentBalance(wallet);

  const lines = [
    `💳 **Agent Wallet Balance State**`,
    `**Address**: \`${balanceInfo.wallet}\``,
    `- **On-chain Balance**: ${motesToCspr(balanceInfo.balance_motes)}`,
  ];

  if (balanceInfo.daily_limit_motes === null) {
    lines.push(`- **Daily Limit**: None (Unlimited)`);
    lines.push(`- **Spent Today**: ${motesToCspr(balanceInfo.spent_today_motes)}`);
  } else {
    const limit = BigInt(balanceInfo.daily_limit_motes);
    const spent = BigInt(balanceInfo.spent_today_motes);
    const remaining = limit > spent ? limit - spent : 0n;

    lines.push(`- **Daily Limit**: ${motesToCspr(balanceInfo.daily_limit_motes)}`);
    lines.push(`- **Spent Today**: ${motesToCspr(balanceInfo.spent_today_motes)}`);
    lines.push(`- **Remaining Limit**: ${motesToCspr(remaining.toString())}`);

    // Add status warnings
    if (remaining === 0n) {
      lines.push('');
      lines.push(`⚠️ **Warning**: Daily spend limit has been fully depleted. Further paid API calls will be rejected until the limit resets.`);
    } else if (remaining < limit / 10n) {
      lines.push('');
      lines.push(`⚠️ **Warning**: Daily spend limit is running low (< 10% remaining).`);
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
