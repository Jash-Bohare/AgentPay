'use server';

import { pool } from './lib/db';

const BACKEND_URL = process.env.AGENTPAY_BACKEND_URL || 'http://localhost:3001';

const HIDDEN_LISTING_IDS = new Set([
  0,1,2,3,4,5,6,7,8,9,
  10,11,12,13,
  17,18,
  19,20,21,22,
  23,24,25,
  26,27,28, 31, 32
]);

export interface Listing {
  listing_id: string;
  provider_wallet: string;
  name: string;
  description: string;
  endpoint_url: string;
  price_motes: string;
  category: string;
  is_active: boolean;
  reputation_tier: string;
  total_calls: string;
  created_at: string;
}

export interface ProviderStats {
  listings: Listing[];
  totalEarningsMotes: string;
  totalCalls: number;
  activeCount: number;
}

export async function getProviderStats(providerWallet: string): Promise<ProviderStats> {
  try {
    // 1. Fetch all listings for this provider
    const listingsRes = await pool.query<Listing>(
      `SELECT * FROM listings WHERE provider_wallet = $1 ORDER BY listing_id DESC`,
      [providerWallet]
    );

    const filteredListings = listingsRes.rows.filter(
      (listing) => !HIDDEN_LISTING_IDS.has(Number(listing.listing_id))
    );

    // 2. Fetch total calls and total earnings from transactions
    const statsRes = await pool.query<{ total_earned: string; total_calls: string }>(
      `SELECT 
         COALESCE(SUM(net_amount_motes), 0) as total_earned,
         COUNT(*) as total_calls
       FROM transactions 
       WHERE provider_wallet = $1 AND status = 'settled'`,
      [providerWallet]
    );

    const listings = filteredListings;
    const totalEarningsMotes = statsRes.rows[0]?.total_earned || '0';
    const totalCalls = parseInt(statsRes.rows[0]?.total_calls || '0', 10);
    const activeCount = listings.filter((l) => l.is_active).length;

    return {
      listings,
      totalEarningsMotes,
      totalCalls,
      activeCount,
    };
  } catch (err) {
    console.error('getProviderStats failed:', err);
    throw new Error('Failed to fetch provider stats');
  }
}

export interface ListingAnalytics {
  listing: Listing | null;
  recentTransactions: any[];
  hourlyCalls: { hour: string; calls: number }[];
  earningsOverTime: { date: string; earnings: number }[];
}

export async function getListingAnalytics(listingId: number): Promise<ListingAnalytics> {
  try {
    // 1. Fetch listing details
    const listingRes = await pool.query<Listing>(
      `SELECT * FROM listings WHERE listing_id = $1`,
      [listingId]
    );
    const listing = listingRes.rows[0] || null;

    if (!listing) {
      return { listing: null, recentTransactions: [], hourlyCalls: [], earningsOverTime: [] };
    }

    // 2. Fetch last 10 transactions
    const txsRes = await pool.query(
      `SELECT tx_id, agent_wallet, gross_amount_motes, net_amount_motes, status, created_at, on_chain_tx_hash
       FROM transactions
       WHERE listing_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [listingId]
    );

    // 3. Fetch hourly calls for chart (last 24 hours)
    const hourlyRes = await pool.query<{ hour: string; calls: string }>(
      `SELECT 
         to_char(created_at, 'HH24:00') as hour,
         COUNT(*) as calls
       FROM transactions
       WHERE listing_id = $1 AND status = 'settled' AND created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY hour
       ORDER BY hour`,
      [listingId]
    );

    // 4. Fetch daily earnings for chart (last 7 days)
    const dailyEarningsRes = await pool.query<{ date: string; earnings: string }>(
      `SELECT 
         to_char(created_at, 'Mon DD') as date,
         SUM(net_amount_motes) as earnings
       FROM transactions
       WHERE listing_id = $1 AND status = 'settled' AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY date
       ORDER BY MIN(created_at)`,
      [listingId]
    );

    const hourlyCalls = hourlyRes.rows.map((r) => ({
      hour: r.hour,
      calls: parseInt(r.calls, 10),
    }));

    const earningsOverTime = dailyEarningsRes.rows.map((r) => ({
      date: r.date,
      earnings: Number(BigInt(r.earnings) / 1_000_000_000n), // Convert motes to CSPR
    }));

    // If empty charts, populate with mock layout so it looks good at start
    const finalHourlyCalls = hourlyCalls.length > 0 ? hourlyCalls : [
      { hour: '00:00', calls: 0 },
      { hour: '04:00', calls: 5 },
      { hour: '08:00', calls: 12 },
      { hour: '12:00', calls: 24 },
      { hour: '16:00', calls: 18 },
      { hour: '20:00', calls: 7 },
    ];

    const finalEarningsOverTime = earningsOverTime.length > 0 ? earningsOverTime : [
      { date: 'Jun 16', earnings: 0 },
      { date: 'Jun 17', earnings: 1.5 },
      { date: 'Jun 18', earnings: 4.2 },
      { date: 'Jun 19', earnings: 8.5 },
      { date: 'Jun 20', earnings: 14.1 },
      { date: 'Jun 21', earnings: 22.4 },
      { date: 'Jun 22', earnings: 35.8 },
    ];

    return {
      listing,
      recentTransactions: txsRes.rows,
      hourlyCalls: finalHourlyCalls,
      earningsOverTime: finalEarningsOverTime,
    };
  } catch (err) {
    console.error('getListingAnalytics failed:', err);
    throw new Error('Failed to fetch listing analytics');
  }
}

export async function registerListingOnBackend(params: {
  name: string;
  description: string;
  endpoint_url: string;
  price_per_call: string;
  category: string;
  rate_limit_per_second: number;
}) {
  try {
    const res = await fetch(`${BACKEND_URL}/provider/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || `HTTP error ${res.status}`);
    }

    return (await res.json()) as { listing_id: number };
  } catch (err) {
    console.error('registerListingOnBackend failed:', err);
    throw err;
  }
}

export interface AgentDashboardData {
  wallet: string;
  dailyLimitMotes: string | null;
  spentTodayMotes: string;
  balanceMotes: string;
  transactions: any[];
  categoriesCount: { category: string; value: number }[];
  spendHistory: { date: string; spent: number }[];
}

export async function getAgentDashboardData(agentWallet: string): Promise<AgentDashboardData> {
  try {
    // 1. Fetch balance & limits from backend endpoint (re-uses backend's CSPR.cloud client)
    const backendRes = await fetch(`${BACKEND_URL}/agent/${agentWallet}/balance`);
    let balanceMotes = '0';
    let dailyLimitMotes: string | null = null;
    let spentTodayMotes = '0';

    if (backendRes.ok) {
      const balanceData = await backendRes.json();
      balanceMotes = balanceData.balance_motes || '0';
      dailyLimitMotes = balanceData.daily_limit_motes;
      spentTodayMotes = balanceData.spent_today_motes || '0';
    }

    // 2. Fetch last 20 transactions
    const txsRes = await pool.query(
      `SELECT t.*, l.name as listing_name
       FROM transactions t
       LEFT JOIN listings l ON t.listing_id = l.listing_id
       WHERE t.agent_wallet = $1
       ORDER BY t.created_at DESC
       LIMIT 20`,
      [agentWallet]
    );

    // 3. Category distribution
    const catRes = await pool.query<{ category: string; count: string }>(
      `SELECT l.category, COUNT(*) as count
       FROM transactions t
       JOIN listings l ON t.listing_id = l.listing_id
       WHERE t.agent_wallet = $1 AND t.status = 'settled'
       GROUP BY l.category`,
      [agentWallet]
    );

    // 4. Spend history
    const historyRes = await pool.query<{ date: string; spent: string }>(
      `SELECT to_char(created_at, 'Mon DD') as date, SUM(gross_amount_motes) as spent
       FROM transactions
       WHERE agent_wallet = $1 AND status = 'settled'
       GROUP BY date
       ORDER BY MIN(created_at)
       LIMIT 7`,
      [agentWallet]
    );

    const categoriesCount = catRes.rows.map((r) => ({
      category: r.category || 'Unknown',
      value: parseInt(r.count, 10),
    }));

    const spendHistory = historyRes.rows.map((r) => ({
      date: r.date,
      spent: Number(BigInt(r.spent) / 1_000_000_000n),
    }));

    return {
      wallet: agentWallet,
      dailyLimitMotes,
      spentTodayMotes,
      balanceMotes,
      transactions: txsRes.rows,
      categoriesCount: categoriesCount.length > 0 ? categoriesCount : [{ category: 'Data Feed', value: 1 }],
      spendHistory: spendHistory.length > 0 ? spendHistory : [{ date: 'Today', spent: 0 }],
    };
  } catch (err) {
    console.error('getAgentDashboardData failed:', err);
    throw new Error('Failed to load agent dashboard data');
  }
}

export async function updateAgentLimit(agentWallet: string, dailyLimitMotes: string) {
  try {
    const limit = dailyLimitMotes === '' ? '0' : dailyLimitMotes;
    await pool.query(
      `INSERT INTO agent_limits (agent_wallet, daily_limit_motes, spent_today_motes, window_start)
       VALUES ($1, $2, 0, NOW())
       ON CONFLICT (agent_wallet) 
       DO UPDATE SET daily_limit_motes = $2`,
      [agentWallet, limit]
    );
    return { success: true };
  } catch (err) {
    console.error('updateAgentLimit failed:', err);
    throw new Error('Failed to update agent limit');
  }
}

export async function getMarketplaceListings(category?: string) {
  try {
    const conditions = ['is_active = true'];
    const params: any[] = [];
    if (category) {
      params.push(category);
      conditions.push(`category = $1`);
    }

    const res = await pool.query(
      `SELECT * FROM listings
       WHERE ${conditions.join(' AND ')}
       ORDER BY reputation_tier DESC, listing_id ASC`,
      params
    );

    return res.rows.filter(
      (listing) => !HIDDEN_LISTING_IDS.has(Number(listing.listing_id))
    );
  } catch (err) {
    console.error('getMarketplaceListings failed:', err);
    throw new Error('Failed to get marketplace listings');
  }
}

// ---------------------------------------------------------------------------
// Developer Agent wallet management
// ---------------------------------------------------------------------------

export interface AgentWalletSummary {
  wallet: string;
  balanceMotes: string;
  dailyLimitMotes: string | null;
  spentTodayMotes: string;
  status: 'Active' | 'Paused' | 'Near limit';
  txCount: number;
}

export async function getDeveloperAgents(developerWallet: string): Promise<AgentWalletSummary[]> {
  try {
    // Collect all agent wallets that appear in transactions OR in agent_limits
    // For the demo, we seed both the mock "agent" wallet from the env + any that
    // have actually made transactions through this provider.
    const walletsRes = await pool.query<{ wallet: string }>(
      `SELECT DISTINCT agent_wallet as wallet FROM transactions
       WHERE agent_wallet IS NOT NULL
       UNION
       SELECT DISTINCT agent_wallet as wallet FROM agent_limits
       WHERE agent_wallet IS NOT NULL`,
    );

    const wallets = walletsRes.rows.map((r) => r.wallet);

    // If there are no wallets yet, return a seeded demo wallet so the dev
    // dashboard never looks completely empty.
    const DEMO_AGENT = 'f6df2b9fc09d2b5f25af65faf36bc3bc4a6537597cc0181f9a2e1458cde387e3';
    if (!wallets.includes(DEMO_AGENT)) wallets.unshift(DEMO_AGENT);

    const results: AgentWalletSummary[] = await Promise.all(
      wallets.map(async (wallet) => {
        // Balance from the backend (CSPR.cloud via facilitator)
        let balanceMotes = '0';
        try {
          const balRes = await fetch(`${BACKEND_URL}/agent/${wallet}/balance`);
          if (balRes.ok) {
            const data = await balRes.json();
            balanceMotes = data.balance_motes ?? '0';
          }
        } catch {
          // swallow — CSPR node might be slow; show 0 rather than explode
        }

        // Limits from DB
        const limRes = await pool.query<{ daily_limit_motes: string; spent_today_motes: string }>(
          `SELECT daily_limit_motes, spent_today_motes FROM agent_limits WHERE agent_wallet = $1`,
          [wallet],
        );
        const lim = limRes.rows[0];
        const dailyLimitMotes = lim?.daily_limit_motes ?? null;
        const spentTodayMotes = lim?.spent_today_motes ?? '0';

        // Transaction count
        const txRes = await pool.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM transactions WHERE agent_wallet = $1`,
          [wallet],
        );
        const txCount = parseInt(txRes.rows[0]?.count ?? '0', 10);

        // Compute status
        let status: AgentWalletSummary['status'] = 'Active';
        if (dailyLimitMotes === '0' || dailyLimitMotes === null) {
          status = 'Active';
        } else {
          const limit = BigInt(dailyLimitMotes);
          const spent = BigInt(spentTodayMotes);
          if (limit > 0n && spent >= limit) {
            status = 'Paused';
          } else if (limit > 0n && spent >= (limit * 80n) / 100n) {
            status = 'Near limit';
          }
        }

        return { wallet, balanceMotes, dailyLimitMotes, spentTodayMotes, status, txCount };
      }),
    );

    return results;
  } catch (err) {
    console.error('getDeveloperAgents failed:', err);
    throw new Error('Failed to load developer agents');
  }
}

export async function topUpAgentWallet(agentWallet: string): Promise<{
  success: boolean;
  tx_hash?: string;
  explorer_url?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${BACKEND_URL}/agent/${agentWallet}/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'topup_failed');
    return { success: true, tx_hash: data.tx_hash, explorer_url: data.explorer_url };
  } catch (err: any) {
    console.error('topUpAgentWallet failed:', err);
    return { success: false, error: err?.message ?? 'topup_failed' };
  }
}

