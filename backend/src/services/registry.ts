import {
  BytesReader,
  callContract,
  cl,
  readContractStorage,
  u64MappingKey,
  waitForTransactionFinality
} from './casper.js';
type PrivateKey = import('casper-js-sdk').PrivateKey;
type CLValue = import('casper-js-sdk').CLValue;
import casperSdkDefault from 'casper-js-sdk';
const casperSdk = casperSdkDefault as unknown as typeof import('casper-js-sdk');
const { CLValue: CLValueCtor } = casperSdk;

export const CATEGORIES = ['PriceData', 'Compute', 'Compliance', 'Document', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface OnChainListing {
  listing_id: number;
  provider_wallet: string;
  name: string;
  description: string;
  endpoint_url: string;
  price_per_call: bigint;
  category: Category;
  rate_limit_per_second: number;
  is_active: boolean;
  created_at: bigint;
}

const REGISTRY_CONTRACT_HASH = process.env.REGISTRY_CONTRACT_HASH!;

// "listing_count" is a Sequence<u64>, which nests its inner Var at child index 0
// within the field's own index (1 << 4 | ...). Field order: listings=1,
// provider_listings=2, listing_count=3 -> packed path [3, 0] -> 0x30.
const LISTING_COUNT_FIELD = 0x30;
const LISTINGS_FIELD = 1;

function decodeListing(bytes: Uint8Array): OnChainListing {
  const r = new BytesReader(bytes);
  const listing_id = Number(r.readU64());
  const provider_wallet = r.readAddress();
  const name = r.readString();
  const description = r.readString();
  const endpoint_url = r.readString();
  const price_per_call = r.readU512();
  const category = CATEGORIES[r.readU8()] ?? 'Other';
  const rate_limit_per_second = r.readU32();
  const is_active = r.readBool();
  const created_at = r.readU64();
  return {
    listing_id,
    provider_wallet,
    name,
    description,
    endpoint_url,
    price_per_call,
    category,
    rate_limit_per_second,
    is_active,
    created_at
  };
}

/**
 * Returns the number of listings registered so far. The contract's Sequence
 * stores the last assigned id (not a count), so an empty registry reads as
 * "no value stored" - we treat that as 0 listings rather than id -1.
 */
export async function getListingCount(): Promise<number> {
  const bytes = await readContractStorage(REGISTRY_CONTRACT_HASH, LISTING_COUNT_FIELD);
  if (!bytes) return 0;
  const lastAssignedId = new BytesReader(bytes).readU64();
  return Number(lastAssignedId) + 1;
}

export async function getListing(listingId: number): Promise<OnChainListing | null> {
  const bytes = await readContractStorage(REGISTRY_CONTRACT_HASH, LISTINGS_FIELD, u64MappingKey(listingId));
  if (!bytes) return null;
  return decodeListing(bytes);
}

export async function getAllListings(): Promise<OnChainListing[]> {
  const count = await getListingCount();
  const listings: OnChainListing[] = [];
  for (let id = 0; id < count; id++) {
    const listing = await getListing(id);
    if (listing) listings.push(listing);
  }
  return listings;
}

export interface RegisterListingParams {
  name: string;
  description: string;
  endpointUrl: string;
  pricePerCallMotes: bigint;
  category: Category;
  rateLimitPerSecond: number;
}

/**
 * Registers a new listing on-chain and waits for it to finalize, then returns
 * the assigned listing_id (read back from listing_count, since this backend is
 * the registry's sole writer). Registration is a one-time setup action, not a
 * high-frequency path, so waiting for real finality here is the right tradeoff -
 * unlike /verify, which is deliberately optimistic.
 */
export async function registerListing(params: RegisterListingParams, signerPrivateKey: PrivateKey): Promise<number> {
  const categoryIndex = CATEGORIES.indexOf(params.category);
  if (categoryIndex === -1) throw new Error(`Unknown category: ${params.category}`);

  const args: Record<string, CLValue> = {
    name: CLValueCtor.newCLString(params.name),
    description: CLValueCtor.newCLString(params.description),
    endpoint_url: CLValueCtor.newCLString(params.endpointUrl),
    price_per_call: cl.u512(params.pricePerCallMotes),
    category: CLValueCtor.newCLUint8(categoryIndex),
    rate_limit_per_second: CLValueCtor.newCLUInt32(params.rateLimitPerSecond)
  };

  const txHash = await callContract(REGISTRY_CONTRACT_HASH, 'register_listing', args, signerPrivateKey);
  await waitForTransactionFinality(txHash);
  return (await getListingCount()) - 1;
}
