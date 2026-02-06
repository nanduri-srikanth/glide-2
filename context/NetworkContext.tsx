/**
 * Network Context
 *
 * Provides network connectivity state throughout the app.
 * Uses NetInfo to detect online/offline status.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

interface NetworkContextType {
  isOnline: boolean;
  isConnected: boolean | null;
  connectionType: string | null;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkState, setNetworkState] = useState<NetInfoState | null>(null);

  useEffect(() => {
    // Set up TanStack Query's online manager to sync with NetInfo
    onlineManager.setEventListener((setOnline) => {
      return NetInfo.addEventListener((state) => {
        setOnline(!!state.isConnected);
      });
    });

    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkState(state);
      console.log('[Network] Connection state:', state.isConnected, state.type);
    });

    // Get initial state
    NetInfo.fetch().then((state) => {
      setNetworkState(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const value: NetworkContextType = {
    isOnline: networkState?.isConnected ?? true,
    isConnected: networkState?.isConnected ?? null,
    connectionType: networkState?.type ?? null,
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

export default NetworkContext;
