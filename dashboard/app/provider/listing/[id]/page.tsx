'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Navbar from '../../../components/navbar';
import { useWallet } from '../../../context/wallet-context';
import { getListingAnalytics } from '../../../actions';
import type { Listing } from '../../../actions';
import {
  ArrowLeft,
  Cpu,
  Coins,
  Activity,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';

export default function ListingAnalytics() {
  const { id } = useParams();
  const { isConnected, connect } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    listing: Listing | null;
    recentTransactions: any[];
    hourlyCalls: { hour: string; calls: number }[];
    earningsOverTime: { date: string; earnings: number }[];
  } | null>(null);

  const fetchAnalytics = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const analytics = await getListingAnalytics(Number(id));
      setData(analytics);
    } catch (err) {
      console.error('Failed to load listing analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (isConnected && id) {
      fetchAnalytics();
    } else {
      setLoading(false);
    }
  }, [id, isConnected]);

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  const formatMotes = (motesStr: string) => {
    try {
      const motes = BigInt(motesStr);
      const cspr = Number(motes) / 1_000_000_000;
      return cspr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } catch (e) {
      return '0.00';
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-8 rounded-2xl border-white/5 text-center bg-zinc-950/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/10 text-violet-400 mx-auto mb-6 border border-violet-500/20">
              <Cpu size={26} />
            </div>
            <h2 className="text-2xl font-bold text-white">Connection Required</h2>
            <p className="mt-3 text-sm text-zinc-400">
              Please connect your Casper Wallet or select the **API Provider** simulation profile in the navbar to check analytics.
            </p>
            <div className="mt-8 space-y-3">
              <button
                onClick={() => connect('API Provider')}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-500/10 hover:brightness-110 active:scale-[0.98]"
              >
                Use Provider Profile (Demo)
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
        <Navbar />
        <main className="flex-grow mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-pulse">
          <div className="h-6 w-32 bg-white/5 rounded-xl" />
          <div className="h-10 w-64 bg-white/5 rounded-xl" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="h-32 bg-white/5 rounded-2xl" />
            <div className="h-32 bg-white/5 rounded-2xl" />
            <div className="h-32 bg-white/5 rounded-2xl" />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="h-64 bg-white/5 rounded-2xl" />
            <div className="h-64 bg-white/5 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!data?.listing) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-8 rounded-2xl border-white/5 text-center bg-zinc-950/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 mx-auto mb-6 border border-rose-500/20">
              <AlertCircle size={26} />
            </div>
            <h2 className="text-2xl font-bold text-white">Listing Not Found</h2>
            <p className="mt-3 text-sm text-zinc-400">
              The listing ID **#{id}** does not exist or belongs to another provider.
            </p>
            <div className="mt-8">
              <Link
                href="/provider"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 py-3 font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                Go to Provider Panel
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { listing, recentTransactions, hourlyCalls, earningsOverTime } = data;

  // Compute stats
  const totalCalls = recentTransactions.filter((t) => t.status === 'settled').length;
  const totalGrossMotes = recentTransactions
    .filter((t) => t.status === 'settled')
    .reduce((sum, t) => sum + BigInt(t.gross_amount_motes), 0n);
  const totalEarnedMotes = recentTransactions
    .filter((t) => t.status === 'settled')
    .reduce((sum, t) => sum + BigInt(t.net_amount_motes), 0n);

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
      <Navbar />

      <main className="flex-grow mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Back Link */}
        <Link
          href="/provider"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </Link>

        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10 pb-6 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-violet-600/10 text-violet-400 border border-violet-500/20">
                {listing.category}
              </span>
              <span className="text-zinc-500 text-xs font-mono">ID: #{listing.listing_id}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{listing.name}</h1>
            <p className="mt-1.5 text-zinc-400 max-w-2xl text-xs sm:text-sm">
              {listing.description}
            </p>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              listing.is_active
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {listing.is_active ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {listing.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Small details panel */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 border border-white/5 bg-[#121218]/30 rounded-2xl p-5 text-xs font-mono">
          <div>
            <p className="text-zinc-500 uppercase font-semibold text-[10px] tracking-wider mb-1">Price Per Call</p>
            <p className="text-zinc-200 font-bold">{formatMotes(listing.price_motes)} CSPR</p>
          </div>
          <div>
            <p className="text-zinc-500 uppercase font-semibold text-[10px] tracking-wider mb-1">Rate Limit</p>
            <p className="text-zinc-200 font-bold">{listing.total_calls} calls / sec</p> 
            {/* Note: listing.total_calls database structure maps to rate_limit_per_second */}
          </div>
          <div>
            <p className="text-zinc-500 uppercase font-semibold text-[10px] tracking-wider mb-1">Reputation Tier</p>
            <p className="text-zinc-200 font-bold text-violet-400">{listing.reputation_tier}</p>
          </div>
          <div>
            <p className="text-zinc-500 uppercase font-semibold text-[10px] tracking-wider mb-1">Endpoint</p>
            <p className="text-zinc-400 truncate max-w-[150px] sm:max-w-xs">{listing.endpoint_url}</p>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          <div className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Calls (Sample)</span>
              <Activity size={16} className="text-indigo-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white font-mono">{totalCalls}</p>
            <p className="mt-1 text-xs text-zinc-500">Settled calls in recent history</p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Net Earnings (Sample)</span>
              <Coins size={16} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white font-mono">{formatMotes(totalEarnedMotes.toString())} CSPR</p>
            <p className="mt-1 text-xs text-zinc-500">Excludes facilitator fee</p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Gross Value</span>
              <TrendingUp size={16} className="text-violet-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white font-mono">{formatMotes(totalGrossMotes.toString())} CSPR</p>
            <p className="mt-1 text-xs text-zinc-500">Gross volume processed on-chain</p>
          </div>
        </div>

        {/* Charts */}
        {mounted && (
          <div className="grid lg:grid-cols-2 gap-8 mb-10">
            {/* Request Volume Chart */}
            <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 p-6 space-y-6">
              <div>
                <h3 className="font-bold text-white text-base">Request Volume (Last 24 Hours)</h3>
                <p className="text-xs text-zinc-500">API call spikes and load trends</p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyCalls} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="hour" stroke="#52525b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#121218', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontSize: '12px' }}
                      itemStyle={{ color: '#a78bfa', fontSize: '12px' }}
                    />
                    <Bar dataKey="calls" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Earnings Chart */}
            <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 p-6 space-y-6">
              <div>
                <h3 className="font-bold text-white text-base">Daily Earnings (Last 7 Days)</h3>
                <p className="text-xs text-zinc-500">Earnings growth represented in CSPR</p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={earningsOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.03)" />
                    <XAxis dataKey="date" stroke="#52525b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#121218', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontSize: '12px' }}
                      itemStyle={{ color: '#34d399', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="earnings" stroke="#10b981" fillOpacity={1} fill="url(#colorEarnings)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Recent Transactions list */}
        <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-white text-lg">Recent Settlements</h3>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 font-mono">
              Last {recentTransactions.length} transactions
            </span>
          </div>

          {recentTransactions && recentTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-950/20">
                    <th className="py-4 px-6">Transaction ID</th>
                    <th className="py-4 px-6">Agent Wallet</th>
                    <th className="py-4 px-6">Gross Amount</th>
                    <th className="py-4 px-6">Net Earnings</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Timestamp</th>
                    <th className="py-4 px-6 text-right">On-Chain hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentTransactions.map((tx) => (
                    <tr key={tx.tx_id} className="hover:bg-white/[0.01] transition-colors font-mono text-xs">
                      <td className="py-4 px-6 text-zinc-400">
                        #{tx.tx_id}
                      </td>
                      <td className="py-4 px-6 text-zinc-300">
                        {truncateAddress(tx.agent_wallet)}
                      </td>
                      <td className="py-4 px-6 text-zinc-200">
                        {formatMotes(tx.gross_amount_motes)} CSPR
                      </td>
                      <td className="py-4 px-6 text-emerald-400">
                        +{formatMotes(tx.net_amount_motes)} CSPR
                      </td>
                      <td className="py-4 px-6 font-sans">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          tx.status === 'settled'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : tx.status === 'transfer_only'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-zinc-400">
                        <span className="font-sans text-xs">{formatDate(tx.created_at)} </span>
                        <span>{formatTime(tx.created_at)}</span>
                      </td>
                      <td className="py-4 px-6 text-right font-sans">
                        {tx.on_chain_tx_hash ? (
                          <a
                            href={`https://testnet.cspr.live/transaction/${tx.on_chain_tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors font-bold"
                          >
                            explorer
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-zinc-600 text-xs">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 px-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-500 mx-auto mb-4 border border-white/5">
                <Calendar size={18} />
              </div>
              <h4 className="text-white font-bold">No transaction data available</h4>
              <p className="mt-1 text-xs text-zinc-500 max-w-xs mx-auto">
                No payments have settled for this API listing in this sandbox environment yet.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
