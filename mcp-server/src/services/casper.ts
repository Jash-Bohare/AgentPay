/**
 * MCP server Casper SDK wrapper.
 *
 * Much slimmer than the backend's casper.ts — the MCP server only needs to:
 *   1. Load the agent's PEM private key (for signing x402 payloads)
 *   2. Sign a message and return the hex signature
 *   3. Expose the agent's public key hex (embedded in every x402 payload so the
 *      backend can verify the signature without reversing an account hash)
 *
 * All balance queries and on-chain reads go through the backend REST API rather
 * than hitting the Casper node directly — this keeps the MCP server's dependency
 * surface small and the backend as the single gateway to chain state.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// casper-js-sdk ships as CJS; Node's ESM/CJS interop can't statically detect
// named exports, so we import as default and cast — same pattern as the backend.
import casperSdkDefault from 'casper-js-sdk';
const casperSdk = casperSdkDefault as unknown as typeof import('casper-js-sdk');
const { KeyAlgorithm, PrivateKey } = casperSdk;
type PrivateKey = import('casper-js-sdk').PrivateKey;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Singleton agent key, loaded once at startup
// ---------------------------------------------------------------------------

let _agentKey: PrivateKey | null = null;

/**
 * Returns the agent wallet private key, loading it lazily on first call.
 * Accepts either a PEM file path (absolute or relative to this file) or a raw
 * PEM string — the MCP config can supply either.
 */
export function getAgentKey(): PrivateKey {
  if (_agentKey) return _agentKey;

  const keyPath = process.env.AGENT_WALLET_PRIVATE_KEY_PATH;
  if (!keyPath) {
    throw new Error('AGENT_WALLET_PRIVATE_KEY_PATH is not set in the MCP server environment');
  }

  // Resolve relative paths relative to the project root (two levels up from src/services/)
  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.resolve(__dirname, '..', '..', keyPath);

  const pem = readFileSync(resolvedPath, 'utf-8');
  _agentKey = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
  return _agentKey;
}

/**
 * Returns the agent's full public key as a hex string (including the 2-byte
 * algorithm prefix). This must be included in every x402 payload so the backend
 * can verify the signature without inverting the account-hash one-way function.
 */
export function getAgentPublicKeyHex(): string {
  return getAgentKey().publicKey.toHex();
}

/**
 * Signs `message` (raw UTF-8 string) with the agent's private key and returns
 * the hex-encoded signature in the same format the backend's casper.ts
 * signMessage() produces — a 1-byte algorithm tag followed by the compact (r||s)
 * signature bytes.  The backend's PublicKey.verifySignature() expects exactly
 * this format.
 */
export function signMessage(message: string): string {
  const privateKey = getAgentKey();
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = privateKey.signAndAddAlgorithmBytes(messageBytes);
  return Buffer.from(signatureBytes).toString('hex');
}
