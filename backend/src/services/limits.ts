import { pool } from '../db/index.js';

interface LimitCheckResult {
  allowed: boolean;
  remaining: bigint;
}

/**
 * Checks whether `amountMotes` fits within the agent's remaining daily allowance,
 * and if so, records the spend. The 24h window resets relative to `window_start`,
 * not midnight. An agent with no configured limit is rejected by default.
 *
 * This is a single atomic UPDATE ... WHERE ... RETURNING, not a SELECT followed
 * by an UPDATE - two concurrent calls for the same agent could otherwise both
 * pass the check before either one's UPDATE lands, letting spend exceed the
 * configured limit. Postgres evaluates and applies this row-by-row under a
 * single statement, so a second concurrent call sees the first one's effect.
 */
export async function checkAndUpdateLimit(
  agentWallet: string,
  amountMotes: bigint
): Promise<LimitCheckResult> {
  const result = await pool.query<{ daily_limit_motes: string; spent_today_motes: string }>(
    `UPDATE agent_limits
     SET
       spent_today_motes = CASE
         WHEN NOW() - window_start >= INTERVAL '24 hours' THEN $2
         ELSE spent_today_motes + $2
       END,
       window_start = CASE
         WHEN NOW() - window_start >= INTERVAL '24 hours' THEN NOW()
         ELSE window_start
       END
     WHERE agent_wallet = $1
       AND (
         (NOW() - window_start >= INTERVAL '24 hours' AND $2 <= daily_limit_motes)
         OR
         (NOW() - window_start < INTERVAL '24 hours' AND spent_today_motes + $2 <= daily_limit_motes)
       )
     RETURNING daily_limit_motes, spent_today_motes`,
    [agentWallet, amountMotes.toString()]
  );

  if (result.rowCount === 0) {
    // Either the wallet isn't configured at all, or the spend would exceed the
    // limit. Disambiguate with a plain read - purely for the error message,
    // the decision above already happened atomically.
    const existing = await pool.query<{ daily_limit_motes: string; spent_today_motes: string }>(
      'SELECT daily_limit_motes, spent_today_motes FROM agent_limits WHERE agent_wallet = $1',
      [agentWallet]
    );
    const row = existing.rows[0];
    if (!row) return { allowed: false, remaining: 0n };
    return { allowed: false, remaining: BigInt(row.daily_limit_motes) - BigInt(row.spent_today_motes) };
  }

  const row = result.rows[0]!;
  return { allowed: true, remaining: BigInt(row.daily_limit_motes) - BigInt(row.spent_today_motes) };
}
