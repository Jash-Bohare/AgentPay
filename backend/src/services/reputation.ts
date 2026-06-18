import { addressMappingKey, BytesReader, readContractStorage } from './casper.js';

export const TIERS = ['New', 'Established', 'Trusted', 'Elite'] as const;
export type Tier = (typeof TIERS)[number];

export interface ProviderScore {
  total_calls_served: bigint;
  successful_calls: bigint;
  failed_calls: bigint;
  total_cspr_earned: bigint;
  uptime_score: number;
  accuracy_score: number;
  reputation_tier: Tier;
  last_updated: bigint;
}

const REPUTATION_CONTRACT_HASH = process.env.REPUTATION_CONTRACT_HASH!;
const PROVIDER_SCORES_FIELD = 1;

export async function getProviderScore(providerAccountHashHex: string): Promise<ProviderScore | null> {
  const bytes = await readContractStorage(REPUTATION_CONTRACT_HASH, PROVIDER_SCORES_FIELD, addressMappingKey(providerAccountHashHex));
  if (!bytes) return null;

  const r = new BytesReader(bytes);
  return {
    total_calls_served: r.readU64(),
    successful_calls: r.readU64(),
    failed_calls: r.readU64(),
    total_cspr_earned: r.readU512(),
    uptime_score: r.readU8(),
    accuracy_score: r.readU8(),
    reputation_tier: TIERS[r.readU8()] ?? 'New',
    last_updated: r.readU64()
  };
}
