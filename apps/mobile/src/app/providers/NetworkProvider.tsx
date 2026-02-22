import NetInfo from '@react-native-community/netinfo';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface NetworkContextValue {
  isConnected: boolean;
  isInternetReachable: boolean;
  isOffline: boolean;
  refreshConnectivity: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(Boolean(state.isInternetReachable ?? state.isConnected));
    });

    void NetInfo.fetch().then((state) => {
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(Boolean(state.isInternetReachable ?? state.isConnected));
    });

    return unsubscribe;
  }, []);

  const refreshConnectivity = async () => {
    const state = await NetInfo.fetch();
    setIsConnected(Boolean(state.isConnected));
    setIsInternetReachable(Boolean(state.isInternetReachable ?? state.isConnected));
  };

  const value = useMemo<NetworkContextValue>(
    () => ({
      isConnected,
      isInternetReachable,
      isOffline: !isConnected || !isInternetReachable,
      refreshConnectivity,
    }),
    [isConnected, isInternetReachable],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetworkStatus(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used inside NetworkProvider');
  }

  return context;
}
