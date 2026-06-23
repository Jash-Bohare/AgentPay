'use client';

import React, { useEffect, useState, startTransition } from 'react';
import Link from 'next/link';
import Navbar from '../components/navbar';
import { useWallet } from '../context/wallet-context';
import { getDeveloperAgents, topUpAgentWallet } from '../actions';
import type { AgentWalletSummary } from '../actions';
import {
  Terminal,
  Zap,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Coins,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  TrendingUp,
  Copy,
  CheckCheck,
} from 'lucide-react';

const STATUS_STYLE: Record<AgentWalletSummary['status'], string> = {
  Active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Near limit': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Paused: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};
const STATUS_ICON: Record<AgentWalletSummary['status'], React.ElementType> = {
  Active: CheckCircle2,
  'Near limit': AlertTriangle,
  Paused: PauseCircle,
};

export default function DeveloperPage() {
  const { activeWallet, isConnected, connect } = useWallet();
  const [agents, setAgents] = useState<AgentWalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  const [topupResult, setTopupResult] = useState<{
    wallet: string;
    tx_hash?: string;
    explorer_url?: string;
    error?: string;
  } | null>(null);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  const fetchAgents = async () => {
    if (!activeWallet) return;
    setLoading(true);
    try {
      const data = await getDeveloperAgents(activeWallet);
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && activeWallet) {
      fetchAgents();
    } else {
      setLoading(false);
    }
  }, [isConnected, activeWallet]);

  const handleRefresh = () => {
    startTransition(() => {
      fetchAgents();
    });
  };

  const handleTopUp = async (wallet: string) => {
    setToppingUp(wallet);
    setTopupResult(null);
    try {
      const result = await topUpAgentWallet(wallet);
      setTopupResult({ wallet, ...result });
    } finally {
      setToppingUp(null);
    }
  };

  const handleCopyWallet = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedWallet(addr);
    setTimeout(() => setCopiedWallet(null), 2000);
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

  const spentPercent = (spent: string, limit: string | null) => {
    if (!limit || limit === '0') return 0;
    try {
      const s = Number(BigInt(spent));
      const l = Number(BigInt(limit));
      return Math.min(100, Math.round((s / l) * 100));
    } catch {
      return 0;
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-8 rounded-2xl border-white/5 text-center bg-zinc-950/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-400 mx-auto mb-6 border border-emerald-500/20">
              <Terminal size={26} />
            </div>
            <h2 className="text-2xl font-bold text-white">Developer Access Required</h2>
            <p className="mt-3 text-sm text-zinc-400">
              Connect with the Agent Developer profile to manage budgets and monitor autonomous
              agent wallets.
            </p>
            <div className="mt-8 space-y-3">
              <button
                onClick={() => connect('Agent Developer')}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 font-semibold text-white shadow-lg shadow-emerald-500/10 hover:brightness-110 active:scale-[0.98]"
              >
                Use Agent Developer Profile (Demo)
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

  const totalBalance = agents.reduce((sum, a) => {
    try { return sum + Number(BigInt(a.balanceMotes)); } catch { return sum; }
  }, 0);
  const totalTx = agents.reduce((sum, a) => sum + a.txCount, 0);
  const activeCount = agents.filter((a) => a.status === 'Active').length;

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
      <Navbar />

      <main className="flex-grow mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10 pb-6 border-b border-white/5">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
              Developer Console
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white mt-1">Agent Wallets</h1>
            <p className="mt-1 text-sm text-zinc-500 font-mono truncate max-w-lg">
              Controller: {activeWallet}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 self-start md:self-center h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 text-sm font-medium"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Top-up result banner */}
        {topupResult && (
          <div
            className={`mb-6 flex items-start gap-4 rounded-xl border p-4 ${
              topupResult.tx_hash
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : 'border-rose-500/20 bg-rose-500/5 text-rose-300'
            }`}
          >
            {topupResult.tx_hash ? <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
            <div className="text-sm">
              {topupResult.tx_hash ? (
                <>
                  <span className="font-bold">Top-up submitted!</span> 50 CSPR is on its way to{' '}
                  <span className="font-mono">{topupResult.wallet.slice(0, 8)}…</span>.{' '}
                  <a
                    href={topupResult.explorer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline inline-flex items-center gap-1"
                  >
                    View on Explorer <ExternalLink size={11} />
                  </a>
                </>
              ) : (
                <>
                  <span className="font-bold">Top-up failed:</span> {topupResult.error}
                </>
              )}
            </div>
            <button
              onClick={() => setTopupResult(null)}
              className="ml-auto text-current opacity-50 hover:opacity-100 text-lg leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Summary stat cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {[
            {
              label: 'Total Managed Balance',
              value: `${(totalBalance / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} CSPR`,
              icon: Coins,
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10 border-emerald-500/20',
            },
            {
              label: 'Active Agent Wallets',
              value: `${activeCount} / ${agents.length}`,
              icon: Terminal,
              color: 'text-indigo-400',
              bg: 'bg-indigo-500/10 border-indigo-500/20',
            },
            {
              label: 'Lifetime Transactions',
              value: totalTx.toLocaleString(),
              icon: TrendingUp,
              color: 'text-violet-400',
              bg: 'bg-violet-500/10 border-violet-500/20',
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className="glass-panel p-6 rounded-2xl border-white/5 bg-gradient-to-br from-[#121218] to-[#0c0c11]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {label}
                </span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${bg} ${color}`}>
                  <Icon size={15} />
                </div>
              </div>
              <p className="mt-4 text-3xl font-extrabold text-white font-mono">{value}</p>
            </div>
          ))}
        </div>

        {/* Agent wallets table */}
        <div className="glass-panel rounded-2xl border-white/5 bg-[#121218]/40 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-white text-lg">Managed Agent Wallets</h3>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 font-mono">
              {agents.length} registered
            </span>
          </div>

          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-20 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-zinc-500 mx-auto mb-4 border border-white/5">
                <Terminal size={20} />
              </div>
              <h4 className="text-white font-bold">No agent wallets yet</h4>
              <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">
                Agent wallets appear here once they make their first payment via the AgentPay MCP
                server.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {agents.map((agent) => {
                const pct = spentPercent(agent.spentTodayMotes, agent.dailyLimitMotes);
                const StatusIcon = STATUS_ICON[agent.status];
                const isTopping = toppingUp === agent.wallet;
                const barColor =
                  pct >= 100
                    ? 'bg-rose-500'
                    : pct >= 80
                    ? 'bg-amber-400'
                    : 'bg-emerald-500';

                return (
                  <div
                    key={agent.wallet}
                    className="px-6 py-5 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Wallet address + copy */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[agent.status]}`}
                          >
                            <StatusIcon size={9} />
                            {agent.status}
                          </span>
                          <span className="text-zinc-500 text-[10px] font-mono">
                            {agent.txCount} tx
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-200 truncate max-w-[220px] sm:max-w-xs">
                            {agent.wallet}
                          </span>
                          <button
                            onClick={() => handleCopyWallet(agent.wallet)}
                            className="flex-shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
                          >
                            {copiedWallet === agent.wallet ? (
                              <CheckCheck size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Balance */}
                      <div className="flex-shrink-0 text-right">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Balance</p>
                        <p className="text-sm font-bold text-white font-mono">
                          {formatMotes(agent.balanceMotes, '0.00')} CSPR
                        </p>
                      </div>

                      {/* Spend progress */}
                      <div className="flex-shrink-0 w-40">
                        <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                          <span>Daily spend</span>
                          <span>
                            {agent.dailyLimitMotes
                              ? `${pct}%`
                              : 'No limit'}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-800/60 overflow-hidden">
                          {agent.dailyLimitMotes && (
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between text-[9px] text-zinc-600 mt-1 font-mono">
                          <span>{formatMotes(agent.spentTodayMotes, '0')} spent</span>
                          <span>{agent.dailyLimitMotes ? formatMotes(agent.dailyLimitMotes, '∞') : '∞'} limit</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleTopUp(agent.wallet)}
                          disabled={!!isTopping}
                          className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 px-3 py-1.5 text-xs font-bold hover:bg-emerald-500/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        >
                          {isTopping ? (
                            <>
                              <RefreshCw size={11} className="animate-spin" /> Sending…
                            </>
                          ) : (
                            <>
                              <Zap size={11} /> Top Up
                            </>
                          )}
                        </button>
                        <Link
                          href={`/developer/agent/${agent.wallet}`}
                          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 text-zinc-300 px-3 py-1.5 text-xs font-bold hover:bg-white/10 hover:text-white transition-colors"
                        >
                          Manage <ChevronRight size={13} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
