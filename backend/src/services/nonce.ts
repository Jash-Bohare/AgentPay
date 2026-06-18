import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL! });
let connected = false;

async function ensureConnected() {
  if (!connected) {
    await redis.connect();
    connected = true;
  }
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
  if (connected) {
    await redis.quit();
    connected = false;
  }
}
