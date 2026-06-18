import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

router.get('/listings', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const conditions = ['is_active = true'];
  const params: unknown[] = [];
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  params.push(limit, offset);

  const rows = await pool.query(
    `SELECT listing_id, provider_wallet, name, description, endpoint_url, price_motes, category, reputation_tier, total_calls, created_at
     FROM listings
     WHERE ${conditions.join(' AND ')}
     ORDER BY listing_id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return res.json({ listings: rows.rows, count: rows.rowCount });
});

export default router;
