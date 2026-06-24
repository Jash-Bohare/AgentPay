import { pool } from '../db/index.js';
import { getProviderScore } from './reputation.js';
import { getAllListings } from './registry.js';

const LISTINGS_SYNC_INTERVAL_MS = 60_000;
const REPUTATION_SYNC_INTERVAL_MS = 5 * 60_000;

/**
 * Demo whitelist.
 * Only these APIs should appear in the marketplace/dashboard.
 */
// const DEMO_LISTING_IDS = new Set([
//   14,
//   15,
//   16,
//   29
// ]);

/** Mirrors Registry's on-chain listings into Postgres.
 * For the hackathon demo we only sync active demo listings.
 */
export async function syncListingsFromChain(): Promise<void> {
  const allListings = await getAllListings();

  const listings = allListings.filter(
    (listing) => listing.is_active
  );

  // Optional: remove non-demo listings already present in Postgres
  // await pool.query(`
  // DELETE FROM listings
  // WHERE listing_id NOT IN (26,27,28,29)
  // `);

  for (const listing of listings) {
    await pool.query(
      `INSERT INTO listings (
          listing_id,
          provider_wallet,
          name,
          description,
          endpoint_url,
          price_motes,
          category,
          is_active,
          created_at
       )
       VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          to_timestamp($9 / 1000.0)
       )
       ON CONFLICT (listing_id)
       DO UPDATE SET
         provider_wallet = $2,
         name = $3,
         description = $4,
         endpoint_url = $5,
         price_motes = $6,
         category = $7,
         is_active = $8`,
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

/** Pulls provider reputation data from chain */
export async function syncReputationScores(): Promise<void> {
  const listingRows = await pool.query<{
    listing_id: number;
    provider_wallet: string;
  }>(
    `SELECT listing_id, provider_wallet FROM listings`
  );

  for (const row of listingRows.rows) {
    const score = await getProviderScore(row.provider_wallet);

    if (!score) continue;

    await pool.query(
      `UPDATE listings
       SET reputation_tier = $1,
           total_calls = $2
       WHERE listing_id = $3`,
      [
        score.reputation_tier,
        score.total_calls_served.toString(),
        row.listing_id
      ]
    );
  }
}

/** Starts sync loops */
export function startSyncLoops(): void {
  syncListingsFromChain().catch((err: unknown) =>
    console.error('Initial listings sync failed:', err)
  );

  syncReputationScores().catch((err: unknown) =>
    console.error('Initial reputation sync failed:', err)
  );

  setInterval(() => {
    syncListingsFromChain().catch((err: unknown) =>
      console.error('Listings sync failed:', err)
    );
  }, LISTINGS_SYNC_INTERVAL_MS);

  setInterval(() => {
    syncReputationScores().catch((err: unknown) =>
      console.error('Reputation sync failed:', err)
    );
  }, REPUTATION_SYNC_INTERVAL_MS);
}