'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from './components/navbar';
import { useWallet } from './context/wallet-context';
import { Cpu, Terminal, ArrowRight, ShieldCheck, Activity, Zap, Coins, CheckCircle, ExternalLink } from 'lucide-react';

export default function Home() {
  const { connect } = useWallet();

  const steps = [
    {
      num: '01',
      title: 'List Your API',
      description: 'Providers define price per call, rate limits, and metadata. The API is cataloged in the Registry contract.',
      icon: Cpu,
    },
    {
      num: '02',
      title: 'Agent Discovery & Call',
      description: 'AI agents find listings via our MCP server, sign x402 payment headers, and execute direct HTTP calls.',
      icon: Terminal,
    },
    {
      num: '03',
      title: 'On-chain Settlement',
      description: 'Facilitator verifies payment, executes the transfer on Casper Testnet, and logs reputation details.',
      icon: Coins,
    },
  ];

  const features = [
    {
      title: 'x402 Payment Protocol',
      desc: 'Cryptographic proof of payment embedded in standard HTTP headers. No API keys or accounts needed.',
      icon: Zap,
    },
    {
      title: 'On-Chain Reputation',
      desc: 'Automatic ranking of agents and providers based on actual payments and service fulfillment rates.',
      icon: ShieldCheck,
    },
    {
      title: 'Enforced Budgets',
      desc: 'Off-chain limits protect developer wallets. Set daily ceilings so agents never spend more than allowed.',
      icon: Activity,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
      <Navbar />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-28 md:pt-32 md:pb-40">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/15 via-[#0b0b0f]/0 to-[#0b0b0f] -z-10" />
          
          {/* Animated Background Grids */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] -z-10" />

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            {/* Tagline Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/5 px-3 py-1 text-xs font-medium text-violet-300 backdrop-blur-sm animate-pulse-slow">
              <span className="flex h-2 w-2 rounded-full bg-violet-400" />
              Stripe for AI Agents on Casper Network
            </div>

            {/* Hero Headings */}
            <h1 className="mt-8 max-w-4xl mx-auto text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-none">
              Payment Infrastructure for the{' '}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                Autonomous AI Economy
              </span>
            </h1>

            <p className="mt-6 max-w-2xl mx-auto text-lg text-zinc-400 md:text-xl">
              Enable AI agents to discover, access, and pay for APIs autonomously. 
              No human signups, no subscriptions—pure pay-as-you-go cryptographically verified micropayments.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/marketplace"
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-xl shadow-indigo-500/10 transition-all hover:shadow-indigo-500/25 hover:brightness-110"
              >
                Explore Marketplace
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <button
                onClick={() => connect('API Provider')}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-semibold text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
              >
                List Your API
              </button>
            </div>
          </div>
        </section>

        {/* Roles Section */}
        <section className="py-20 border-t border-white/5 bg-zinc-950/20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Integrated Developer & Provider Suites
              </h2>
              <p className="mt-4 text-zinc-400">
                Choose a portal to start listing custom API capabilities or configure and monitor your autonomous agent wallets.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* API Provider Card */}
              <div className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 mb-6 border border-violet-500/20">
                    <Cpu size={22} />
                  </div>
                  <h3 className="text-2xl font-bold text-white">API Providers</h3>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    Monetize data and compute streams in real-time. Integrate the AgentPay Express middleware, list your API parameters, and let agents query and settle transactions using on-chain testnet tokens.
                  </p>
                  <ul className="mt-6 space-y-2.5 text-zinc-400 text-xs">
                    <li className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-violet-400" /> Dynamic on-chain price settings
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-violet-400" /> Cryptographic request auth check
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-violet-400" /> Real-time performance chart metrics
                    </li>
                  </ul>
                </div>
                <div className="mt-8 pt-6 border-t border-white/5">
                  <Link
                    href="/provider"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600/10 py-3 text-sm font-semibold text-violet-400 hover:bg-violet-600/20 transition-colors"
                  >
                    Go to Provider Panel
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>

              {/* Agent Developer Card */}
              <div className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-6 border border-emerald-500/20">
                    <Terminal size={22} />
                  </div>
                  <h3 className="text-2xl font-bold text-white">Agent Developers</h3>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    Fund agent wallets, deploy daily spending ceilings, review granular request logs, and configure security whitelist guidelines to prevent agents from draining funds on runaway loops.
                  </p>
                  <ul className="mt-6 space-y-2.5 text-zinc-400 text-xs">
                    <li className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-emerald-400" /> Automated daily spending limits
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-emerald-400" /> Real-time request transaction logs
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-emerald-400" /> Categories and API whitelist config
                    </li>
                  </ul>
                </div>
                <div className="mt-8 pt-6 border-t border-white/5">
                  <Link
                    href="/developer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600/10 py-3 text-sm font-semibold text-emerald-400 hover:bg-emerald-600/20 transition-colors"
                  >
                    Go to Developer Panel
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-white">How AgentPay Operates</h2>
              <p className="mt-4 text-zinc-400">
                A seamless integration flow bridging on-chain contracts, local agents, and public API interfaces.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
              {/* Connector lines on large screens */}
              <div className="hidden md:block absolute top-1/2 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-violet-500/20 to-emerald-500/20 -translate-y-6 -z-10" />

              {steps.map((step, idx) => {
                const Icon = step.icon;
                return (
                  <div key={idx} className="glass-panel p-6.5 rounded-xl border-white/5 bg-zinc-950/20 relative">
                    <span className="absolute top-4 right-5 text-4xl font-black text-zinc-800/40 select-none">
                      {step.num}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-violet-400 mb-5 border border-white/10">
                      <Icon size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white">{step.title}</h3>
                    <p className="mt-2 text-zinc-400 text-xs leading-relaxed">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Feature Grid Section */}
        <section className="py-20 border-t border-white/5 bg-zinc-950/10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {features.map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <div key={idx} className="flex gap-4">
                    <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/10 text-violet-400 border border-violet-500/25">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-zinc-100">{feat.title}</h4>
                      <p className="mt-1.5 text-zinc-400 text-xs leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Smart Contracts Verification Section */}
        <section className="py-20 border-t border-white/5 bg-zinc-950/40">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="glass-panel rounded-2xl p-8 border-violet-500/20 bg-gradient-to-br from-[#121218] to-[#0d0d12]">
              <div className="md:flex items-center justify-between gap-8">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Coins className="text-violet-400" size={20} />
                    On-chain Smart Contracts Deployed
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400 max-w-xl">
                    All core settlement registries, reputation metrics, and payment records run on the Casper Network Testnet. Read our live addresses or check state logs via the block explorer.
                  </p>
                </div>
                <div className="mt-6 md:mt-0 flex-shrink-0">
                  <a
                    href="https://testnet.cspr.live"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4.5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
                  >
                    Casper Explorer
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              {/* Addresses List */}
              <div className="mt-8 grid md:grid-cols-3 gap-4 border-t border-white/5 pt-6">
                <div>
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Registry Contract</p>
                  <p className="mt-1 font-mono text-xs text-violet-300 break-all select-all">
                    d9b87e7ea424d3e93bcde9487f842636184eb2bbb9f10b3377dc7f74a90595f3
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Reputation Contract</p>
                  <p className="mt-1 font-mono text-xs text-indigo-300 break-all select-all">
                    56a5fcd172ac50c3cc06fe555fb9806409fde2c012f146803a9afc33b7d397e5
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Payment Contract</p>
                  <p className="mt-1 font-mono text-xs text-emerald-300 break-all select-all">
                    1febe8793989be4da5f83d3313b60143f2d12063688702bedc19722feb4cae25
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500 bg-[#0b0b0f]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} AgentPay. Built for the Casper Network Buildathon 2026.</p>
        </div>
      </footer>
    </div>
  );
}
