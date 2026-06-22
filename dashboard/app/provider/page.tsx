'use client';

import React, { useEffect, useState, startTransition } from 'react';
import Link from 'next/link';
import Navbar from '../components/navbar';
import { useWallet } from '../context/wallet-context';
import { getProviderStats } from '../actions';
import type { Listing } from '../actions';
import { Cpu, Coins, Plus, ChevronRight, BarChart2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function ProviderDashboard() {
  const { activeWallet, isConnected, connect } = useWallet();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    listings: Listing[];
    totalEarningsMotes: string;
    totalCalls: number;
    activeCount: number;
  } | null>(null);

  const fetchStats = async () => {
    if (!activeWallet) return;
    setLoading(true);
    try {
      const data = await getProviderStats(activeWallet);
      setStats(data);
    } catch (err) {
      console.error('Failed to load provider stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && activeWallet) {
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [activeWallet, isConnected]);

  const handleRefresh = () => {
    startTransition(() => {
      fetchStats();
    });
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

  if (!isConnected) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-8 rounded-2xl border-white/5 text-center bg-zinc-950/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/10 text-violet-400 mx-auto mb-6 border border-violet-500/20">
              <Cpu size={26} />
            </div>
            <h2 className="text-2xl font-bold text-white">Provider Access Required</h2>
            <p className="mt-3 text-sm text-zinc-400">
              To list and manage your APIs, please connect your Casper Wallet or select the **API Provider** simulation profile.
            </p>
            <div className="mt-8 space-y-3">
              <button
                onClick={() => connect('API Provider')}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-500/10 hover:brightness-110 active:scale-[0.98]"
              >
                Use Provider Profile (Demo)
              </button>
              <button
                onClick={() => connect()}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                Connect Casper Wallet
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
      <Navbar />

      <main className="flex-grow mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10 pb-6 border-b border-white/5">
          <div>
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">Dashboard</span>
            <h1 className="text-3xl font-bold tracking-tight text-white mt-1">API Provider Control Panel</h1>
            <p className="mt-1 text-sm text-zinc-500 font-mono truncate max-w-lg md:max-w-xl">
              Wallet: {activeWallet}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              title="Refresh Stats"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/provider/new"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/10 hover:brightness-110"
            >
              <Plus size={16} />
              List New API
            </Link>
          </div>
        </div>

        {loading && !stats ? (
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[1, 2, 3].map((n) => (
              <div key={n} className="glass-panel p-6 rounded-2xl border-white/5 h-32 animate-pulse bg-zinc-950/20" />
            ))}
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              {/* Stat 1: Earnings */}
              <div className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Earnings</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Coins size={16} />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-white font-mono">
                    {formatMotes(stats?.totalEarningsMotes || '0')}
                  </span>
                  <span className="text-sm font-semibold text-emerald-400 uppercase">CSPR</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">Gross revenue minus 0.5% protocol fee</p>
              </div>

              {/* Stat 2: Active Listings */}
              <div className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Active Services</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                    <Cpu size={16} />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white font-mono">
                    {stats?.activeCount || 0}
                  </span>
                  <span className="text-zinc-500 text-xs font-medium">/ {stats?.listings.length || 0} total</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">Listed on-chain and actively queried</p>
              </div>

              {/* Stat 3: Total API Calls */}
              <div className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Setted Requests</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <BarChart2 size={16} />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white font-mono">
                    {stats?.totalCalls.toLocaleString() || 0}
                  </span>
                  <span className="text-emerald-400 text-xs font-medium">100% Success</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">Total microtransactions processed on-chain</p>
              </div>
            </div>

            {/* Listings Section */}
            <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 overflow-hidden">
              <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-white text-lg">My API Registries</h3>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 font-mono">
                  {stats?.listings.length || 0} registered
                </span>
              </div>

              {stats?.listings && stats.listings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-950/20">
                        <th className="py-4 px-6">API Name</th>
                        <th className="py-4 px-6">Category</th>
                        <th className="py-4 px-6">Price Per Call</th>
                        <th className="py-4 px-6">Reputation Tier</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {stats.listings.map((listing) => (
                        <tr key={listing.listing_id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="py-4 px-6">
                            <div className="font-semibold text-white group-hover:text-violet-400 transition-colors">
                              {listing.name}
                            </div>
                            <div className="text-zinc-500 text-xs truncate max-w-xs mt-0.5">
                              {listing.endpoint_url}
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-900 border border-white/5 text-zinc-300">
                              {listing.category}
                            </span>
                          </td>
                          <td className="py-4 px-6 font-mono text-zinc-200">
                            {formatMotes(listing.price_motes)} CSPR
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              listing.reputation_tier === 'Elite'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                : listing.reputation_tier === 'Trusted'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : listing.reputation_tier === 'Established'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                            }`}>
                              {listing.reputation_tier}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            {listing.is_active ? (
                              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                                <CheckCircle2 size={14} /> Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-xs text-rose-400">
                                <AlertCircle size={14} /> Inactive
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <Link
                              href={`/provider/listing/${listing.listing_id}`}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/15 rounded-lg px-3 py-1.5"
                            >
                              Analytics
                              <ChevronRight size={13} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-20 px-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-zinc-500 mx-auto mb-4 border border-white/5">
                    <Cpu size={20} />
                  </div>
                  <h4 className="text-white font-bold">No registered APIs found</h4>
                  <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">
                    List your first paid API service endpoint to start earning CSPR micropayments from autonomous AI agents.
                  </p>
                  <Link
                    href="/provider/new"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/10 mt-6 hover:brightness-110"
                  >
                    <Plus size={16} />
                    List New API
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
