'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface MockWallet {
  name: string;
  address: string;
  label: string;
}

export const MOCK_WALLETS: MockWallet[] = [
  {
    name: 'API Provider',
    address: '832467189c656e3a73531b63f401480bf9f1e72b00f449c6177d252556d127ff',
    label: 'Provider Wallet',
  },
  {
    name: 'Agent Developer',
    address: 'f6df2b9fc09d2b5f25af65faf36bc3bc4a6537597cc0181f9a2e1458cde387e3',
    label: 'Agent Dev Wallet',
  },
  {
    name: 'Platform Treasury',
    address: '9b9cf2b2a7c891c8b28212ad3cac254149f67d3963f96b6351f42b71b9791555',
    label: 'Treasury Wallet',
  },
];

interface WalletContextType {
  activeWallet: string | null;
  isConnected: boolean;
  walletName: string | null;
  walletType: 'real' | 'mock' | null;
  connect: (addressOrMockName?: string) => Promise<void>;
  disconnect: () => void;
  isWalletHelperAvailable: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeWallet, setActiveWallet] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<'real' | 'mock' | null>(null);
  const [isWalletHelperAvailable, setIsWalletHelperAvailable] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).casperWalletHelper) {
      setIsWalletHelperAvailable(true);
    }
  }, []);

  const connect = async (addressOrMockName?: string) => {
    const matchedMock = MOCK_WALLETS.find(
      (w) => w.name === addressOrMockName || w.address === addressOrMockName
    );

    if (matchedMock) {
      setActiveWallet(matchedMock.address);
      setWalletName(matchedMock.name);
      setWalletType('mock');
      localStorage.setItem('ap_wallet_address', matchedMock.address);
      localStorage.setItem('ap_wallet_name', matchedMock.name);
      localStorage.setItem('ap_wallet_type', 'mock');
      return;
    }

    if (typeof window !== 'undefined' && (window as any).casperWalletHelper) {
      try {
        const helper = (window as any).casperWalletHelper;
        const connected = await helper.requestConnection();
        if (connected) {
          const address = await helper.getActivePublicKey();
          setActiveWallet(address);
          setWalletName('Casper Wallet');
          setWalletType('real');
          localStorage.setItem('ap_wallet_address', address);
          localStorage.setItem('ap_wallet_name', 'Casper Wallet');
          localStorage.setItem('ap_wallet_type', 'real');
        }
      } catch (err) {
        console.error('Error connecting to Casper Wallet:', err);
      }
    } else {
      // Default fallback is Agent Developer for testing
      connect('Agent Developer');
    }
  };

  const disconnect = () => {
    setActiveWallet(null);
    setWalletName(null);
    setWalletType(null);
    localStorage.removeItem('ap_wallet_address');
    localStorage.removeItem('ap_wallet_name');
    localStorage.removeItem('ap_wallet_type');
  };

  useEffect(() => {
    const savedAddress = localStorage.getItem('ap_wallet_address');
    const savedName = localStorage.getItem('ap_wallet_name');
    const savedType = localStorage.getItem('ap_wallet_type') as 'real' | 'mock';

    if (savedAddress && savedName && savedType) {
      setActiveWallet(savedAddress);
      setWalletName(savedName);
      setWalletType(savedType);
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        activeWallet,
        isConnected: !!activeWallet,
        walletName,
        walletType,
        connect,
        disconnect,
        isWalletHelperAvailable,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
