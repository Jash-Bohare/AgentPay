import { pool } from '../db/index.js';

interface LimitCheckResult {
  allowed: boolean;
  remaining: bigint;
}

interface AgentLimitRow {
  daily_limit_motes: string;
  spent_today_motes: string;
  window_start: Date;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Checks whether `amountMotes` fits within the agent's remaining daily allowance,
 * and if so, records the spend. The 24h window resets relative to `window_start`,
 * not midnight. An agent with no configured limit is rejected by default.
 */
export async function checkAndUpdateLimit(
  agentWallet: string,
  amountMotes: bigint
): Promise<LimitCheckResult> {
  const rows = await pool.query<AgentLimitRow>(
    'SELECT daily_limit_motes, spent_today_motes, window_start FROM agent_limits WHERE agent_wallet = $1',
    [agentWallet]
  );

  if (rows.rowCount === 0) {
    return { allowed: false, remaining: 0n };
  }

  const row = rows.rows[0]!;
  const dailyLimit = BigInt(row.daily_limit_motes);
  const windowExpired = Date.now() - row.window_start.getTime() >= TWENTY_FOUR_HOURS_MS;
  const spentSoFar = windowExpired ? 0n : BigInt(row.spent_today_motes);

  if (spentSoFar + amountMotes > dailyLimit) {
    return { allowed: false, remaining: dailyLimit - spentSoFar };
  }

  const newSpent = spentSoFar + amountMotes;
  await pool.query(
    windowExpired
      ? 'UPDATE agent_limits SET spent_today_motes = $1, window_start = NOW() WHERE agent_wallet = $2'
      : 'UPDATE agent_limits SET spent_today_motes = $1 WHERE agent_wallet = $2',
    [newSpent.toString(), agentWallet]
  );

  return { allowed: true, remaining: dailyLimit - newSpent };
}
