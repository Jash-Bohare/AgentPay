'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Navbar from '../../../components/navbar';
import { useWallet } from '../../../context/wallet-context';
import {
  getAgentDashboardData,
  updateAgentLimit,
  topUpAgentWallet,
} from '../../../actions';
import type { AgentDashboardData } from '../../../actions';
import {
  ArrowLeft,
  Zap,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  Copy,
  CheckCheck,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';

const CATEGORIES = ['PriceData', 'Compute', 'Compliance', 'Document', 'Other'];
const PIE_COLORS = ['#8b5cf6', '#10b981', '#6366f1', '#f59e0b', '#ec4899'];

export default function AgentDetailPage() {
  const { wallet } = useParams() as { wallet: string };
  const { isConnected, connect } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<AgentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [limitCspr, setLimitCspr] = useState('');
  const [paused, setPaused] = useState(false);
  const [whitelist, setWhitelist] = useState<string[]>(CATEGORIES);
  const [savingLimit, setSavingLimit] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Top-up state
  const [toppingUp, setToppingUp] = useState(false);
  const [topupResult, setTopupResult] = useState<{
    tx_hash?: string;
    explorer_url?: string;
    error?: string;
  } | null>(null);

  // Copy state
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    if (!wallet) return;
    try {
      const d = await getAgentDashboardData(wallet);
      setData(d);
      // Sync paused state from daily limit (0 = paused)
      if (d.dailyLimitMotes === '0') setPaused(true);
    } catch (err) {
      console.error('Failed to load agent data:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    setMounted(true);
    if (isConnected && wallet) {
      fetchData();
      // Poll every 5 seconds for real-time tx feed
      pollRef.current = setInterval(() => {
        setPolling(true);
        fetchData().finally(() => setPolling(false));
      }, 5000);
    } else {
      setLoading(false);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isConnected, wallet, fetchData]);

  // Pre-fill limit input from fetched data
  useEffect(() => {
    if (data?.dailyLimitMotes && data.dailyLimitMotes !== '0') {
      const cspr = (Number(BigInt(data.dailyLimitMotes)) / 1e9).toFixed(2);
      setLimitCspr(cspr);
    }
  }, [data?.dailyLimitMotes]);

  const handleSaveLimit = async () => {
    setSavingLimit(true);
    setSavedOk(false);
    setSaveError(null);
    try {
      const motes = paused
        ? '0'
        : limitCspr
        ? BigInt(Math.floor(parseFloat(limitCspr) * 1_000_000_000)).toString()
        : '0';
      await updateAgentLimit(wallet, motes);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleTopUp = async () => {
    setToppingUp(true);
    setTopupResult(null);
    const result = await topUpAgentWallet(wallet);
    setTopupResult(result);
    setToppingUp(false);
    // refresh balance after a brief delay
    setTimeout(fetchData, 3000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatMotes = (m: string | null, fallback = '—') => {
    if (!m || m === '0') return fallback;
    try {
      const cspr = Number(BigInt(m)) / 1e9;
      return cspr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } catch {
      return fallback;
    }
  };

  const formatRelative = (dateStr: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return '';
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-8 rounded-2xl border-white/5 text-center bg-zinc-950/20">
            <h2 className="text-2xl font-bold text-white mb-4">Connection Required</h2>
            <button
              onClick={() => connect('Agent Developer')}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 font-semibold text-white hover:brightness-110"
            >
              Use Agent Developer Profile
            </button>
          </div>
        </main>
      </div>
    );
  }

  const spentPct = (() => {
    if (!data?.dailyLimitMotes || data.dailyLimitMotes === '0') return 0;
    try {
      const s = Number(BigInt(data.spentTodayMotes));
      const l = Number(BigInt(data.dailyLimitMotes));
      return Math.min(100, Math.round((s / l) * 100));
    } catch {
      return 0;
    }
  })();

  const barColor = spentPct >= 100 ? '#f43f5e' : spentPct >= 80 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
      <Navbar />

      <main className="flex-grow mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Back */}
        <Link
          href="/developer"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Agent Wallets
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10 pb-6 border-b border-white/5">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
              Agent Detail
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1 flex items-center gap-2">
              <span className="font-mono text-base sm:text-xl break-all">{wallet}</span>
              <button onClick={handleCopy} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0">
                {copied ? (
                  <CheckCheck size={16} className="text-emerald-400" />
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {polling && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
            <button
              onClick={() => { setLoading(true); fetchData(); }}
              className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 text-xs font-medium"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="grid lg:grid-cols-3 gap-8 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-48 rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* ─── Left Column: Controls ─── */}
            <div className="lg:col-span-1 space-y-6">
              {/* Balance Card */}
              <div className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Wallet Balance
                </p>
                <p className="mt-3 text-4xl font-extrabold text-white font-mono">
                  {formatMotes(data?.balanceMotes ?? null, '0.00')}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">CSPR on Casper Testnet</p>

                {/* Top-Up */}
                {topupResult?.tx_hash && (
                  <div className="mt-4 flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                    <CheckCircle2 size={12} />
                    Top-up sent!{' '}
                    <a
                      href={topupResult.explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline inline-flex items-center gap-0.5"
                    >
                      View <ExternalLink size={9} />
                    </a>
                  </div>
                )}
                {topupResult?.error && (
                  <div className="mt-4 flex items-center gap-2 text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2">
                    <AlertCircle size={12} />
                    {topupResult.error}
                  </div>
                )}

                <button
                  onClick={handleTopUp}
                  disabled={toppingUp}
                  className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/10 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  {toppingUp ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Sending 50 CSPR…
                    </>
                  ) : (
                    <>
                      <Zap size={14} /> Top Up 50 CSPR
                    </>
                  )}
                </button>
              </div>

              {/* Daily Limit Form */}
              <div className="glass-panel p-6 rounded-2xl border-white/5 bg-[#121218]/40 space-y-5">
                <h3 className="text-sm font-bold text-white">Spending Controls</h3>

                {/* Pause toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Pause Agent</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Sets daily limit to 0, blocking all payments.
                    </p>
                  </div>
                  <button
                    onClick={() => setPaused((p) => !p)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      paused ? 'bg-rose-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        paused ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Daily limit input */}
                {!paused && (
                  <div>
                    <label
                      htmlFor="daily-limit"
                      className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2"
                    >
                      Daily Limit (CSPR)
                    </label>
                    <div className="relative">
                      <input
                        id="daily-limit"
                        type="number"
                        step="any"
                        min="0"
                        placeholder="e.g. 100"
                        value={limitCspr}
                        onChange={(e) => setLimitCspr(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-zinc-950/40 px-4 pr-16 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                      <span className="absolute inset-y-0 right-4 flex items-center text-zinc-500 text-xs font-semibold">
                        CSPR
                      </span>
                    </div>
                  </div>
                )}

                {/* Current spend progress */}
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                    <span>Today's spend</span>
                    <span>
                      {data?.dailyLimitMotes && data.dailyLimitMotes !== '0'
                        ? `${spentPct}% of limit`
                        : 'No limit set'}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${spentPct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-zinc-600 mt-1 font-mono">
                    <span>{formatMotes(data?.spentTodayMotes ?? null, '0')} spent</span>
                    <span>
                      {data?.dailyLimitMotes && data.dailyLimitMotes !== '0'
                        ? `${formatMotes(data.dailyLimitMotes)} limit`
                        : '∞ limit'}
                    </span>
                  </div>
                </div>

                {/* Save Button */}
                {saveError && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertCircle size={12} /> {saveError}
                  </p>
                )}
                <button
                  onClick={handleSaveLimit}
                  disabled={savingLimit}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  {savingLimit ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Saving…
                    </>
                  ) : savedOk ? (
                    <>
                      <CheckCircle2 size={13} className="text-emerald-400" /> Saved!
                    </>
                  ) : paused ? (
                    <>
                      <PauseCircle size={13} className="text-rose-400" /> Pause Agent
                    </>
                  ) : (
                    <>
                      <Save size={13} /> Save Limit
                    </>
                  )}
                </button>
              </div>

              {/* Category Whitelist */}
              <div className="glass-panel p-6 rounded-2xl border-white/5 bg-[#121218]/40 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Category Whitelist</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Allow or deny calls to specific API categories. (MCP enforcement)
                  </p>
                </div>
                <div className="space-y-2.5">
                  {CATEGORIES.map((cat) => {
                    const checked = whitelist.includes(cat);
                    return (
                      <label
                        key={cat}
                        className="flex items-center justify-between cursor-pointer group"
                      >
                        <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                          {cat}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setWhitelist((prev) =>
                              checked ? prev.filter((c) => c !== cat) : [...prev, cat],
                            )
                          }
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="text-[9px] text-zinc-600 italic">
                  Whitelist config is saved locally and enforced by the MCP server.
                </p>
              </div>
            </div>

            {/* ─── Right Column: Analytics ─── */}
            <div className="lg:col-span-2 space-y-6">
              {/* Real-time Transaction Feed */}
              <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-bold text-white text-base">Real-time Transaction Feed</h3>
                  <div className="flex items-center gap-2">
                    {polling && (
                      <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live (5s)
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Last {data?.transactions.length ?? 0} txs
                    </span>
                  </div>
                </div>

                {data?.transactions && data.transactions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 text-[9px] uppercase tracking-wider text-zinc-500 bg-zinc-950/20">
                          <th className="py-3 px-5">API</th>
                          <th className="py-3 px-5">Amount</th>
                          <th className="py-3 px-5">Status</th>
                          <th className="py-3 px-5 text-right">When</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {data.transactions.map((tx: any) => (
                          <tr key={tx.tx_id} className="hover:bg-white/[0.01] transition-colors font-mono">
                            <td className="py-3.5 px-5 text-zinc-200 max-w-[150px] truncate">
                              <span className="font-sans text-zinc-200">
                                {tx.listing_name ?? `Listing #${tx.listing_id}`}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-emerald-400 font-bold">
                              {(Number(BigInt(tx.gross_amount_motes)) / 1e9).toFixed(4)} CSPR
                            </td>
                            <td className="py-3.5 px-5">
                              <span
                                className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                  tx.status === 'settled'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : tx.status === 'transfer_only'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}
                              >
                                {tx.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-right font-sans text-zinc-400">
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{formatRelative(tx.created_at)}</span>
                                {tx.on_chain_tx_hash && (
                                  <a
                                    href={`https://testnet.cspr.live/transaction/${tx.on_chain_tx_hash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-violet-400 hover:text-violet-300"
                                  >
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-14 px-4">
                    <PlayCircle size={28} className="text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-white font-bold">No transactions yet</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Transactions appear here in real-time as this agent wallet makes API payments.
                    </p>
                  </div>
                )}
              </div>

              {/* Charts Row */}
              {mounted && (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Spend by Category Pie */}
                  <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 p-6 space-y-4">
                    <div>
                      <h3 className="font-bold text-white text-sm">Spend by Category</h3>
                      <p className="text-[10px] text-zinc-500">Distribution of payments by API type</p>
                    </div>
                    {data?.categoriesCount && data.categoriesCount.length > 0 ? (
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.categoriesCount}
                              dataKey="value"
                              nameKey="category"
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={80}
                              paddingAngle={3}
                            >
                              {data.categoriesCount.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: '#121218',
                                borderColor: 'rgba(255,255,255,0.08)',
                                borderRadius: '12px',
                                fontSize: '11px',
                              }}
                              itemStyle={{ color: '#a1a1aa' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-52 flex items-center justify-center text-zinc-600 text-xs">
                        No data yet
                      </div>
                    )}
                    {/* Legend */}
                    {data?.categoriesCount && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {data.categoriesCount.map((c, i) => (
                          <div key={c.category} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <span
                              className="h-2 w-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            {c.category} ({c.value})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Spend History Area Chart */}
                  <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 p-6 space-y-4">
                    <div>
                      <h3 className="font-bold text-white text-sm">Weekly Spend History</h3>
                      <p className="text-[10px] text-zinc-500">CSPR spent per day (last 7 days)</p>
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={data?.spendHistory ?? []}
                          margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="date" stroke="#52525b" fontSize={9} tickLine={false} />
                          <YAxis stroke="#52525b" fontSize={9} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              background: '#121218',
                              borderColor: 'rgba(255,255,255,0.08)',
                              borderRadius: '12px',
                              fontSize: '11px',
                            }}
                            itemStyle={{ color: '#a78bfa' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="spent"
                            stroke="#8b5cf6"
                            fill="url(#spendGradient)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
