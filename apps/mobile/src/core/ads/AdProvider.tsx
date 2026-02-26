import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { useAuth } from '@app/providers/AuthProvider';
import { getGoogleMobileAdsModule } from './mobileAdsModule';

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

  useEffect(() => {
    const googleMobileAds = getGoogleMobileAdsModule();
    if (!googleMobileAds) {
      return;
    }

    void googleMobileAds
      .default()
      .initialize()
      .then(() => {
        if (__DEV__) {
          console.info('[ads][dev] initialized');
        }
      })
      .catch((error: unknown) => {
        if (__DEV__) {
          console.info('[ads][dev] initialize failed', {
            reason: error instanceof Error ? error.message : 'unknown',
          });
        }
      });
  }, []);

  const value = useMemo<AdsContextValue>(
    () => ({
      isPremium: resolveIsPremium(user),
    }),
    [user],
  );

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    console.info('[ads][dev] provider-state', {
      isPremium: value.isPremium,
    });
  }, [value.isPremium]);

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}
