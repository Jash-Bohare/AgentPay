import { readFileSync } from 'node:fs';
import { blake2b } from '@noble/hashes/blake2b';
// casper-js-sdk ships as CJS; Node's ESM/CJS interop can't statically detect its
// named exports, so we import the whole module as default and recover types via
// `typeof import(...)`, which TypeScript resolves from the package's .d.ts files.
import casperSdkDefault from 'casper-js-sdk';
const casperSdk = casperSdkDefault as unknown as typeof import('casper-js-sdk');
const {
  AccountHash,
  Args,
  CLValue,
  ContractCallBuilder,
  HttpHandler,
  Key,
  KeyAlgorithm,
  NativeTransferBuilder,
  ParamDictionaryIdentifier,
  ParamDictionaryIdentifierContractNamedKey,
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

/** Derives the account hash (bare hex, no prefix) that a given public key resolves to. */
export function accountHashFromPublicKey(publicKeyHex: string): string {
  return PublicKey.fromHex(publicKeyHex).accountHash().toHex();
}

/** CLValue factories for building contract call arguments, re-exported so callers
 *  don't need their own copy of the casper-js-sdk CJS/ESM interop workaround. */
export const cl = {
  u64: (value: number | bigint) => CLValue.newCLUint64(value),
  u512: (value: bigint | string) => CLValue.newCLUInt512(value),
  accountKey: (accountHashHex: string) => CLValue.newCLKey(Key.newKey(toAccountHash(accountHashHex).toPrefixedString()))
};

// --- Direct contract storage reads -----------------------------------------
//
// Odra modules store every field in one Casper dictionary named "state" on the
// contract's entity. Each field gets a 1-based declaration-order index; a value
// at that field (or, for a Mapping, at a specific key within it) lives under
// dictionary item key blake2b256(indexBytes ++ mappingKeyBytes).toString('hex'),
// where indexBytes is the big-endian 4-byte packing of the field's index
// (legacy encoding, valid for modules with <=15 top-level fields - true for all
// of ours). This lets us read state directly via the free `state_get_dictionary_item`
// RPC, with no gas cost and no transaction/finality wait - reverse-engineered from
// Odra's own source (odra-core's ContractEnv::current_key) since Odra's CLI getters
// use this same mechanism internally rather than invoking the contract's wasm.

const entityHashCache = new Map<string, string>();

/** Resolves a contract package hash to its current entity (contract) hash. Cached - this rarely changes. */
async function resolveEntityHash(packageHashHex: string): Promise<string> {
  const cached = entityHashCache.get(packageHashHex);
  if (cached) return cached;

  const result = await rpcClient.queryLatestGlobalState(`hash-${packageHashHex}`, []);
  const versions = result.storedValue.contractPackage?.versions ?? [];
  const latest = versions[versions.length - 1];
  if (!latest) throw new Error(`No active contract version found for package ${packageHashHex}`);

  const entityHash = latest.contractHash.hash.toHex();
  entityHashCache.set(packageHashHex, entityHash);
  return entityHash;
}

function fieldIndexBytes(fieldIndex: number): Uint8Array {
  return Uint8Array.from([0, 0, 0, fieldIndex]);
}

/**
 * Reads a single field's raw stored bytes directly from a contract's storage,
 * for free, with no transaction. `mappingKeyBytes` is the serialized key for a
 * `Mapping<K, V>` field (its own bytesrepr encoding), or omit it for a plain
 * `Var<T>`/`Sequence<T>` field. Returns null if nothing is stored there yet.
 */
export async function readContractStorage(
  packageHashHex: string,
  fieldIndex: number,
  mappingKeyBytes?: Uint8Array
): Promise<Uint8Array | null> {
  const entityHash = await resolveEntityHash(packageHashHex);
  const keyBytes = mappingKeyBytes
    ? Buffer.concat([fieldIndexBytes(fieldIndex), mappingKeyBytes])
    : Buffer.from(fieldIndexBytes(fieldIndex));
  const dictionaryItemKey = Buffer.from(blake2b(keyBytes, { dkLen: 32 })).toString('hex');

  try {
    const identifier = new ParamDictionaryIdentifier(
      undefined,
      new ParamDictionaryIdentifierContractNamedKey(`hash-${entityHash}`, 'state', dictionaryItemKey),
      undefined,
      undefined
    );
    const result = await rpcClient.getDictionaryItemByIdentifier(null, identifier);
    const clValue = result.storedValue.clValue;
    if (!clValue) return null;
    // Odra stores every field's serialized bytes wrapped as a Vec<u8> CLValue,
    // which carries its own 4-byte little-endian length prefix ahead of the
    // actual struct bytes - strip it so callers get the raw struct directly.
    const raw = Uint8Array.from(clValue.bytes());
    return raw.slice(4);
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Query failed') || err.message.includes('ValueNotFound'))) {
      return null;
    }
    throw err;
  }
}

/** Serializes a u64 mapping key exactly as Rust's `ToBytes` does: 8 little-endian bytes. */
export function u64MappingKey(value: number | bigint): Uint8Array {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

/** Serializes an Address mapping key exactly as Odra does: a 1-byte tag (0 = Account) + 32-byte account hash. */
export function addressMappingKey(accountHashHex: string): Uint8Array {
  const hash = toAccountHash(accountHashHex);
  return Buffer.concat([Buffer.from([0]), Buffer.from(hash.toBytes())]);
}

/** Sequential reader for Casper's bytesrepr encoding, used to decode raw struct bytes read via readContractStorage. */
export class BytesReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  readU8(): number {
    return this.bytes[this.offset++]!;
  }

  readU32(): number {
    const value = Buffer.from(this.bytes).readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readU64(): bigint {
    const value = Buffer.from(this.bytes).readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readU512(): bigint {
    const length = this.readU8();
    const numberBytes = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    let value = 0n;
    for (let i = numberBytes.length - 1; i >= 0; i--) {
      value = (value << 8n) | BigInt(numberBytes[i]!);
    }
    return value;
  }

  readString(): string {
    const length = this.readU32();
    const stringBytes = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return Buffer.from(stringBytes).toString('utf-8');
  }

  /** Reads an Address (1-byte tag + 32-byte hash) and returns the bare hex account hash. */
  readAddress(): string {
    this.offset += 1; // tag byte (0 = Account, 1 = Contract)
    const hashBytes = this.bytes.slice(this.offset, this.offset + 32);
    this.offset += 32;
    return Buffer.from(hashBytes).toString('hex');
  }
}

/** Returns the CSPR balance of a wallet, in motes, given its account hash (hex, with or without prefix). */
export async function getBalance(accountHashHex: string): Promise<bigint> {
  const purseIdentifier = PurseIdentifier.fromAccountHash(toAccountHash(accountHashHex));
  try {
    const result = await rpcClient.queryLatestBalance(purseIdentifier);
    return BigInt(result.balance.toString());
  } catch (err) {
    // A wallet that has never received funds has no purse on-chain yet - that's
    // a real zero balance, not an error condition.
    if (err instanceof Error && err.message.includes('Purse not found')) {
      return 0n;
    }
    throw err;
  }
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

/**
 * Polls until a transaction has executed (settled or failed), then returns. Throws
 * if the transaction's execution recorded an error, or if it doesn't settle within
 * `timeoutMs`. Used by endpoints that need to confirm on-chain state before
 * responding, as opposed to /verify's deliberately optimistic (non-waiting) design.
 */
export async function waitForTransactionFinality(txHash: string, timeoutMs = 30_000): Promise<void> {
  const pollIntervalMs = 2000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await rpcClient.getTransactionByTransactionHash(txHash);
    console.log('waitForTransactionFinality result:', JSON.stringify(result, null, 2));
    if (result.executionInfo) {
      const errorMessage = result.executionInfo.executionResult?.errorMessage;
      if (errorMessage) throw new Error(`Transaction ${txHash} failed: ${errorMessage}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Transaction ${txHash} did not finalize within ${timeoutMs}ms`);
}
