import { Router } from 'express';
import { pool } from '../db/index.js';
import { providerPrivateKey } from '../keys.js';
import { accountHashFromPublicKey } from '../services/casper.js';
import { CATEGORIES, registerListing } from '../services/registry.js';
import type { Category } from '../services/registry.js';

const router = Router();

const providerAccountHash = accountHashFromPublicKey(providerPrivateKey.publicKey.toHex());

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

router.post('/provider/register', async (req, res) => {
  const body = req.body as Record<string, unknown>;

  if (
    typeof body.name !== 'string' ||
    typeof body.description !== 'string' ||
    typeof body.endpoint_url !== 'string' ||
    typeof body.price_per_call !== 'string' ||
    !/^\d+$/.test(body.price_per_call) ||
    !isCategory(body.category) ||
    typeof body.rate_limit_per_second !== 'number' ||
    !Number.isInteger(body.rate_limit_per_second) ||
    body.rate_limit_per_second < 1 ||
    body.rate_limit_per_second > 4_294_967_295
  ) {
    return res.status(400).json({ error: 'invalid_listing_data' });
  }

  try {
    const listingId = await registerListing(
      {
        name: body.name,
        description: body.description,
        endpointUrl: body.endpoint_url,
        pricePerCallMotes: BigInt(body.price_per_call),
        category: body.category,
        rateLimitPerSecond: body.rate_limit_per_second
      },
      providerPrivateKey
    );

    // ON CONFLICT, not a plain INSERT: the background sync service (sync.ts)
    // polls Registry independently and could mirror this same listing into
    // Postgres first if its tick lands between registerListing's finality wait
    // and this query - without it, that race would throw a duplicate-key error
    // and report registration_failed even though the listing registered fine.
    await pool.query(
      `INSERT INTO listings (listing_id, provider_wallet, name, description, endpoint_url, price_motes, category, is_active, reputation_tier, total_calls, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'New', 0, NOW())
       ON CONFLICT (listing_id) DO UPDATE SET
         provider_wallet = $2, name = $3, description = $4, endpoint_url = $5, price_motes = $6, category = $7`,
      [listingId, providerAccountHash, body.name, body.description, body.endpoint_url, body.price_per_call, body.category]
    );

    return res.status(201).json({ listing_id: listingId });
  } catch (err) {
    console.error('provider/register failed:', err);
    return res.status(502).json({ error: 'registration_failed' });
  }
});

export default router;
