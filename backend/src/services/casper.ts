import { readFileSync } from 'node:fs';
// casper-js-sdk ships as CJS; Node's ESM/CJS interop can't statically detect its
// named exports, so we import the whole module as default and recover types via
// `typeof import(...)`, which TypeScript resolves from the package's .d.ts files.
import casperSdkDefault from 'casper-js-sdk';
const casperSdk = casperSdkDefault as unknown as typeof import('casper-js-sdk');
const {
  AccountHash,
  Args,
  ContractCallBuilder,
  HttpHandler,
  KeyAlgorithm,
  NativeTransferBuilder,
  PrivateKey,
  PublicKey,
  PurseIdentifier,
  RpcClient
} = casperSdk;
type CLValue = import('casper-js-sdk').CLValue;
type PrivateKey = import('casper-js-sdk').PrivateKey;

const NODE_ADDRESS = process.env.CASPER_NODE_ADDRESS!;
const CHAIN_NAME = process.env.CASPER_NETWORK!;

const rpcClient = new RpcClient(new HttpHandler(NODE_ADDRESS));

/** Loads a Casper secp256k1 private key from a PEM file. All AgentPay testnet wallets use secp256k1. */
export function loadPrivateKey(pemPath: string): PrivateKey {
  const pem = readFileSync(pemPath, 'utf-8');
  return PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
}

/** Accepts a bare hex account hash and ensures it carries the "account-hash-" prefix the SDK requires. */
function toAccountHash(accountHashHex: string) {
  const prefixed = accountHashHex.startsWith('account-hash-')
    ? accountHashHex
    : `account-hash-${accountHashHex}`;
  return AccountHash.fromString(prefixed);
}

/** Returns the CSPR balance of a wallet, in motes, given its account hash (hex, with or without prefix). */
export async function getBalance(accountHashHex: string): Promise<bigint> {
  const purseIdentifier = PurseIdentifier.fromAccountHash(toAccountHash(accountHashHex));
  const result = await rpcClient.queryLatestBalance(purseIdentifier);
  return BigInt(result.balance.toString());
}

/**
 * Signs `message` (raw UTF-8 bytes) and returns the hex-encoded signature, in the
 * format `verifySignature` below expects: a 1-byte algorithm tag followed by the
 * compact (r||s) signature. This is what `PublicKey.verifySignature` requires —
 * a bare compact or DER signature without the tag byte is rejected as invalid.
 */
export function signMessage(privateKey: PrivateKey, message: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const signature = privateKey.signAndAddAlgorithmBytes(messageBytes);
  return Buffer.from(signature).toString('hex');
}

/**
 * Verifies that `signatureHex` (as produced by `signMessage`) is a valid signature
 * of `message` produced by the private key matching `publicKeyHex`.
 *
 * The SDK's underlying verifySignature throws on a non-matching signature instead
 * of returning false, so we normalize that into a plain boolean here.
 */
export function verifySignature(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const publicKey = PublicKey.fromHex(publicKeyHex);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(Buffer.from(signatureHex, 'hex'));
    return publicKey.verifySignature(messageBytes, signatureBytes);
  } catch {
    return false;
  }
}

/**
 * Transfers CSPR from the wallet behind `fromPrivateKey` to `toAccountHashHex`.
 * Broadcasts the transaction and returns its hash immediately (does not wait for finality).
 */
export async function transferCSPR(
  fromPrivateKey: PrivateKey,
  toAccountHashHex: string,
  amountMotes: bigint
): Promise<string> {
  const targetAccountHash = toAccountHash(toAccountHashHex);

  const transaction = new NativeTransferBuilder()
    .from(fromPrivateKey.publicKey)
    .targetAccountHash(targetAccountHash)
    .amount(amountMotes.toString())
    .id(Date.now())
    .chainName(CHAIN_NAME)
    .payment(100_000_000)
    .build();

  transaction.sign(fromPrivateKey);
  const result = await rpcClient.putTransaction(transaction);
  return result.transactionHash.toHex();
}

/**
 * Calls a state-changing entry point on a deployed contract (by package hash) and
 * broadcasts the resulting transaction. Callers build `args` with CLValue factories,
 * e.g. `{ listing_id: CLValue.newCLUint64(7) }`.
 */
export async function callContract(
  contractPackageHashHex: string,
  entryPoint: string,
  args: Record<string, CLValue>,
  signerPrivateKey: PrivateKey,
  paymentMotes = 5_000_000_000
): Promise<string> {
  const transaction = new ContractCallBuilder()
    .byPackageHash(contractPackageHashHex)
    .entryPoint(entryPoint)
    .runtimeArgs(Args.fromMap(args))
    .from(signerPrivateKey.publicKey)
    .chainName(CHAIN_NAME)
    .payment(paymentMotes)
    .build();

  transaction.sign(signerPrivateKey);
  const result = await rpcClient.putTransaction(transaction);
  return result.transactionHash.toHex();
}
