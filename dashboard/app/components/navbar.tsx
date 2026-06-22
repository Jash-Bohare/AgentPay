'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet, MOCK_WALLETS } from '../context/wallet-context';
import { Wallet, ChevronDown, LogOut, Cpu, Coins, ShieldCheck, Menu, X, ArrowUpRight } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { activeWallet, isConnected, walletName, walletType, connect, disconnect } = useWallet();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Marketplace', href: '/marketplace' },
    { name: 'Provider Panel', href: '/provider' },
    { name: 'Agent Developer', href: '/developer' },
  ];

  const getMockBadgeColor = (name: string) => {
    switch (name) {
      case 'API Provider':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
      case 'Agent Developer':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Platform Treasury':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0b0b0f]/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/20 transition-transform group-hover:scale-105">
                <Cpu size={18} className="absolute transition-opacity group-hover:opacity-0" />
                <Coins size={18} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-violet-400">
                Agent<span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">Pay</span>
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1.5">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-white/5 text-violet-400 shadow-inner'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    }`}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Wallet connection controls */}
          <div className="hidden md:flex items-center gap-4">
            {isConnected && activeWallet ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition-all hover:bg-white/10 hover:border-white/20 active:scale-[0.98]"
                >
                  <Wallet size={15} className="text-violet-400" />
                  <span className="font-mono text-xs">{truncateAddress(activeWallet)}</span>
                  {walletType === 'mock' && (
                    <span className={`rounded border px-1.5 py-0.2 text-[10px] font-semibold ${getMockBadgeColor(walletName || '')}`}>
                      {walletName === 'API Provider' ? 'Provider' : walletName === 'Agent Developer' ? 'Dev' : 'Treasury'}
                    </span>
                  )}
                  <ChevronDown size={14} className={`text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl border border-white/10 bg-[#121218] p-1.5 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="px-3 py-2 border-b border-white/5">
                      <p className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">Connected Wallet</p>
                      <p className="mt-1 font-mono text-[11px] text-zinc-300 break-all select-all">{activeWallet}</p>
                    </div>

                    <div className="py-1">
                      <p className="px-3 py-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">Simulate Roles</p>
                      {MOCK_WALLETS.map((wallet) => (
                        <button
                          key={wallet.name}
                          onClick={() => {
                            connect(wallet.name);
                            setDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                            activeWallet === wallet.address
                              ? 'bg-violet-600/10 text-violet-400'
                              : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {wallet.name === 'API Provider' && <ArrowUpRight size={13} />}
                            {wallet.name === 'Agent Developer' && <Cpu size={13} />}
                            {wallet.name === 'Platform Treasury' && <ShieldCheck size={13} />}
                            {wallet.name}
                          </span>
                          <span className="font-mono text-[10px] opacity-60">{truncateAddress(wallet.address)}</span>
                        </button>
                      ))}
                    </div>

                    <div className="border-t border-white/5 pt-1.5 pb-1">
                      <button
                        onClick={() => {
                          disconnect();
                          setDropdownOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <LogOut size={13} />
                        Disconnect Wallet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Connect dropdown/trigger */}
                <button
                  onClick={() => connect()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4.5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/10 transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <Wallet size={15} />
                  Connect Wallet
                </button>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                >
                  <ChevronDown size={16} />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-8 mt-44 w-60 origin-top-right rounded-xl border border-white/10 bg-[#121218] p-1.5 shadow-2xl ring-1 ring-black ring-opacity-5 z-50">
                    <p className="px-3 py-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase border-b border-white/5 mb-1">Testing Sandboxes</p>
                    {MOCK_WALLETS.map((wallet) => (
                      <button
                        key={wallet.name}
                        onClick={() => {
                          connect(wallet.name);
                          setDropdownOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                      >
                        <span>{wallet.name}</span>
                        <span className="font-mono text-[9px] opacity-55">{truncateAddress(wallet.address)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu trigger */}
          <div className="flex md:hidden items-center gap-2">
            {isConnected && activeWallet && (
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${getMockBadgeColor(walletName || '')}`}>
                {walletName === 'API Provider' ? 'Provider' : walletName === 'Agent Developer' ? 'Dev' : 'Treasury'}
              </span>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0c0c11] px-4 py-3 space-y-3">
          <div className="space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                    isActive ? 'bg-white/5 text-violet-400' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>

          <div className="border-t border-white/5 pt-3">
            {isConnected && activeWallet ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-zinc-300">
                  <span className="text-zinc-500 font-sans">Wallet:</span>
                  <span>{truncateAddress(activeWallet)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {MOCK_WALLETS.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => connect(w.name)}
                      className={`rounded-lg px-2 py-1.5 text-center text-[10px] font-medium transition-colors border ${
                        activeWallet === w.address
                          ? 'bg-violet-600/10 text-violet-400 border-violet-500/20'
                          : 'bg-zinc-900/30 text-zinc-500 border-white/5 hover:text-zinc-300'
                      }`}
                    >
                      {w.name === 'API Provider' ? 'Provider' : w.name === 'Agent Developer' ? 'Dev' : 'Treasury'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    disconnect();
                    setMobileMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/20"
                >
                  <LogOut size={14} />
                  Disconnect Wallet
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  connect();
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg"
              >
                <Wallet size={15} />
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
