import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL! });
let connectPromise: Promise<unknown> | null = null;

// Concurrent calls during startup could otherwise all see "not connected yet"
// and each call redis.connect(), which throws on the second attempt - caching
// the in-flight promise means every caller awaits the same single connect().
async function ensureConnected() {
  if (!connectPromise) {
    connectPromise = redis.connect();
  }
  await connectPromise;
}

/**
 * Returns true if `nonce` has not been seen before (and stores it), false if it's a replay.
 * The key expires shortly after the payment's own `expiresAt`, so Redis cleans up automatically.
 */
export async function checkAndStoreNonce(nonce: string, expiresAt: number): Promise<boolean> {
  await ensureConnected();
  const key = `nonce:${nonce}`;
  const ttlSeconds = expiresAt - Math.floor(Date.now() / 1000) + 10;
  const result = await redis.set(key, '1', {
    expiration: { type: 'EX', value: Math.max(ttlSeconds, 1) },
    condition: 'NX'
  });
  return result === 'OK';
}

export async function disconnectNonceStore(): Promise<void> {
  if (connectPromise) {
    await redis.quit();
    connectPromise = null;
  }
}
