import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuth } from '@app/providers/AuthProvider';

interface AdsContextValue {
  isPremium: boolean;
}

const AdsContext = createContext<AdsContextValue>({
  isPremium: false,
});

function resolveIsPremium(user: unknown): boolean {
  if (!user || typeof user !== 'object') {
    return false;
  }

  return (user as { isPremium?: boolean }).isPremium === true;
}

export function AdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const value = useMemo<AdsContextValue>(
    () => ({
      isPremium: resolveIsPremium(user),
    }),
    [user],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}
