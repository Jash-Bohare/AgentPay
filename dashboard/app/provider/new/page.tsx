'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/navbar';
import { useWallet } from '../../context/wallet-context';
import { registerListingOnBackend } from '../../actions';
import { Cpu, Terminal, Coins, ArrowLeft, Send, Sparkles, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import Link from 'next/link';

export default function NewListing() {
  const router = useRouter();
  const { isConnected, connect } = useWallet();

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [priceCspr, setPriceCspr] = useState('1.0');
  const [category, setCategory] = useState('Compute');
  const [rateLimit, setRateLimit] = useState(10);

  // Status State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Validation
    if (!name || !description || !endpointUrl || !priceCspr) {
      setError('Please fill in all required fields.');
      setIsSubmitting(false);
      return;
    }

    try {
      // Convert CSPR to motes (1 CSPR = 1,000,000,000 motes)
      const priceFloat = parseFloat(priceCspr);
      if (isNaN(priceFloat) || priceFloat <= 0) {
        setError('Price per call must be a positive number.');
        setIsSubmitting(false);
        return;
      }
      const priceMotes = BigInt(Math.floor(priceFloat * 1_000_000_000)).toString();

      // Submit listing via Server Action
      const result = await registerListingOnBackend({
        name,
        description,
        endpoint_url: endpointUrl,
        price_per_call: priceMotes,
        category,
        rate_limit_per_second: Number(rateLimit),
      });

      setSuccessId(result.listing_id);
    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(err.message || 'Registration failed. Make sure the facilitator backend is running.');
    } finally {
      setIsSubmitting(false);
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
              Please connect your Casper Wallet or select the **API Provider** simulation profile in the navbar to publish new APIs.
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

  if (successId !== null) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0b0b0f]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-8 rounded-2xl border-white/5 text-center bg-zinc-950/20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mx-auto mb-6 border border-emerald-500/25">
              <CheckCircle2 size={36} className="animate-pulse" />
            </div>
            <h2 className="text-3xl font-extrabold text-white">API Registered On-Chain!</h2>
            <p className="mt-3 text-sm text-zinc-400">
              Your API has been registered on the Casper Registry smart contract and is immediately queryable by autonomous agents.
            </p>

            <div className="mt-8 bg-zinc-900/50 rounded-xl p-5 border border-white/5 text-left font-mono">
              <div className="flex justify-between border-b border-white/5 pb-2 text-xs">
                <span className="text-zinc-500">Listing ID:</span>
                <span className="text-emerald-400 font-bold">#{successId}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2 text-xs">
                <span className="text-zinc-500">API Name:</span>
                <span className="text-zinc-300 truncate max-w-[200px]">{name}</span>
              </div>
              <div className="flex justify-between pt-2 text-xs">
                <span className="text-zinc-500">Price/Call:</span>
                <span className="text-zinc-300">{priceCspr} CSPR</span>
              </div>
            </div>

            <div className="mt-10 flex gap-4">
              <Link
                href="/provider"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 py-3 text-sm font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                Go to Dashboard
              </Link>
              <Link
                href={`/provider/listing/${successId}`}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/10 hover:brightness-110"
              >
                <Eye size={15} />
                View Analytics
              </Link>
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
        {/* Back Link */}
        <Link
          href="/provider"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">Publish</span>
          <h1 className="text-3xl font-bold tracking-tight text-white mt-1">List New API Service</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Publish your endpoint to the Casper Network smart contract registry.
          </p>
        </div>

        {/* Dual Panel Grid */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left panel: Registration form */}
          <form onSubmit={handleSubmit} className="lg:col-span-7 glass-panel p-6.5 sm:p-8 rounded-2xl border-white/5 bg-[#121218]/30 space-y-6">
            <h3 className="text-lg font-bold text-white border-b border-white/5 pb-3">API Specification</h3>

            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-400">
                <AlertCircle size={18} className="flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Field 1: Name */}
            <div>
              <label htmlFor="api-name" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                API Name *
              </label>
              <input
                id="api-name"
                type="text"
                required
                placeholder="e.g., CSPR Real-time Price Feed"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            {/* Field 2: Description */}
            <div>
              <label htmlFor="api-desc" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Description *
              </label>
              <textarea
                id="api-desc"
                required
                rows={3}
                placeholder="Provide a detailed description of what the API does, parameters it accepts, and format of returns."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              />
            </div>

            {/* Grid for endpoint & price */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Field 3: Category */}
              <div>
                <label htmlFor="api-cat" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Category
                </label>
                <select
                  id="api-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="PriceData">Price Data Feed</option>
                  <option value="Compute">Compute / Inference</option>
                  <option value="Compliance">Compliance & Validation</option>
                  <option value="Document">Document Parsing</option>
                  <option value="Other">Other / General</option>
                </select>
              </div>

              {/* Field 4: Price per Call */}
              <div>
                <label htmlFor="api-price" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Price Per Call (CSPR) *
                </label>
                <div className="relative">
                  <input
                    id="api-price"
                    type="number"
                    step="any"
                    required
                    min="0.000000001"
                    placeholder="0.5"
                    value={priceCspr}
                    onChange={(e) => setPriceCspr(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-950/40 pl-4 pr-16 py-3 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-500 text-xs font-semibold uppercase">
                    CSPR
                  </div>
                </div>
              </div>
            </div>

            {/* Grid for endpoint & rate limit */}
            <div className="grid md:grid-cols-3 gap-6">
              {/* Field 5: Endpoint URL */}
              <div className="md:col-span-2">
                <label htmlFor="api-url" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Endpoint URL *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500">
                    <Terminal size={14} />
                  </div>
                  <input
                    id="api-url"
                    type="url"
                    required
                    placeholder="http://localhost:3010/price"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-950/40 pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                  />
                </div>
              </div>

              {/* Field 6: Rate Limit */}
              <div>
                <label htmlFor="api-limit" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  QPS Limit
                </label>
                <input
                  id="api-limit"
                  type="number"
                  required
                  min="1"
                  placeholder="10"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="border-t border-white/5 pt-6 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/10 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Deploying Contract...
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Register listing on Casper
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Right panel: Real-time Live Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-panel p-5 rounded-2xl border-white/5 bg-zinc-900/10">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Sparkles size={14} className="text-violet-400" />
                Registry Agent Preview
              </h3>

              {/* Renders how the card looks in agent marketplace */}
              <div className="rounded-xl border border-white/10 bg-[#121218]/90 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-violet-600/10 text-violet-400 border border-violet-500/20 mb-2">
                      {category}
                    </span>
                    <h4 className="text-base font-bold text-white truncate max-w-[200px]">
                      {name || 'Untiled Service'}
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-500 block">Cost / Call</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">
                      {priceCspr ? parseFloat(priceCspr).toFixed(4) : '0.0000'} CSPR
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                  {description || 'No description provided. The description is processed by LLM agents to match queries dynamically.'}
                </p>

                <div className="border-t border-white/5 pt-3.5 space-y-2 text-[10px] font-mono text-zinc-500">
                  <div className="flex justify-between">
                    <span>Provider Wallet:</span>
                    <span className="text-zinc-400 truncate max-w-[150px]">
                      832467189c656e3a73531b63f401480bf9f1e72b00f449c6177d252556d127ff
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Endpoint:</span>
                    <span className="text-zinc-400 truncate max-w-[180px]">
                      {endpointUrl || 'Not specified'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rate Limit:</span>
                    <span className="text-zinc-400">{rateLimit} calls/sec</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Reputation Tier:</span>
                    <span className="text-zinc-400 font-semibold uppercase">New</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-[10px] text-zinc-500 flex gap-2 items-start leading-relaxed bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                <AlertCircle size={12} className="text-violet-400 flex-shrink-0 mt-0.5" />
                <p>
                  Deploying registers the listing on the Casper network testnet. The facilitator sync service mirrors the record locally in PostgreSQL for instant index matching.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
