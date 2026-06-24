import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

const HIDDEN_LISTING_IDS = new Set([
  0,1,2,3,4,5,6,7,8,9,
  10,11,12,13,
  17,18,
  19,20,21,22,
  23,24,25,
  26,27,28, 31, 32
]);

router.get('/listings', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const limit = Math.min(Number(req.query.limit) || 100, 100);
  const offset = Number(req.query.offset) || 0;

  const conditions = ['is_active = true'];
  const params: unknown[] = [];
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  params.push(limit, offset);

  const rows = await pool.query(
    `SELECT listing_id, provider_wallet, name, description, endpoint_url, price_motes, category, is_active, reputation_tier, total_calls, created_at
     FROM listings
     WHERE ${conditions.join(' AND ')}
     ORDER BY listing_id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const filteredListings = rows.rows.filter(
    (listing) => !HIDDEN_LISTING_IDS.has(Number(listing.listing_id))
  );

  return res.json({
    listings: filteredListings,
    count: filteredListings.length
  });
});

export default router;
