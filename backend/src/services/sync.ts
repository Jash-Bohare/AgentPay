import { pool } from '../db/index.js';
import { getProviderScore } from './reputation.js';
import { getAllListings } from './registry.js';

const LISTINGS_SYNC_INTERVAL_MS = 60_000;
const REPUTATION_SYNC_INTERVAL_MS = 5 * 60_000;

/** Mirrors Registry's on-chain listings into Postgres. Registry is the source of
 *  truth; this keeps the Postgres copy (used for fast reads by /listings and the
 *  MCP server) from drifting if it ever falls behind. */
export async function syncListingsFromChain(): Promise<void> {
  const listings = await getAllListings();
  for (const listing of listings) {
    await pool.query(
      `INSERT INTO listings (listing_id, provider_wallet, name, description, endpoint_url, price_motes, category, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))
       ON CONFLICT (listing_id) DO UPDATE SET
         provider_wallet = $2, name = $3, description = $4, endpoint_url = $5,
         price_motes = $6, category = $7, is_active = $8`,
      [
        listing.listing_id,
        listing.provider_wallet,
        listing.name,
        listing.description,
        listing.endpoint_url,
        listing.price_per_call.toString(),
        listing.category,
        listing.is_active,
        listing.created_at.toString()
      ]
    );
  }
}

/** Pulls each listing's provider's current reputation tier from the Reputation
 *  contract - this changes purely on-chain (via Payment's cross-contract call
 *  during settlement) without ever going through this backend's own Postgres
 *  writes, so it's the one piece of state that genuinely needs periodic sync. */
export async function syncReputationScores(): Promise<void> {
  const listingRows = await pool.query<{ listing_id: number; provider_wallet: string }>(
    `SELECT listing_id, provider_wallet FROM listings`
  );

  for (const row of listingRows.rows) {
    const score = await getProviderScore(row.provider_wallet);
    if (!score) continue;
    await pool.query(`UPDATE listings SET reputation_tier = $1, total_calls = $2 WHERE listing_id = $3`, [
      score.reputation_tier,
      score.total_calls_served.toString(),
      row.listing_id
    ]);
  }
}

/** Starts both sync loops. The hackathon scope is plain setInterval polling;
 *  production would watch Casper block events instead of polling on a timer. */
export function startSyncLoops(): void {
  syncListingsFromChain().catch((err: unknown) => console.error('Initial listings sync failed:', err));
  syncReputationScores().catch((err: unknown) => console.error('Initial reputation sync failed:', err));

  setInterval(() => {
    syncListingsFromChain().catch((err: unknown) => console.error('Listings sync failed:', err));
  }, LISTINGS_SYNC_INTERVAL_MS);

  setInterval(() => {
    syncReputationScores().catch((err: unknown) => console.error('Reputation sync failed:', err));
  }, REPUTATION_SYNC_INTERVAL_MS);
}
