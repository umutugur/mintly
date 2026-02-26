import { useEffect } from 'react';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';

import { useRoute } from '@react-navigation/native';

import { useAds } from './AdProvider';
import { getGoogleMobileAdsModule } from './mobileAdsModule';

const IOS_BANNER_UNIT_ID = 'ca-app-pub-6114268066977057/2072968561';
const ANDROID_BANNER_UNIT_ID = 'ca-app-pub-6114268066977057/8163045830';

const ALLOWED_ROUTE_NAMES = new Set(['Dashboard', 'Analytics']);
const BLOCKED_ROUTE_NAMES = new Set([
  'AddTransaction',
  'Transfer',
  'MarkPaid',
  'Security',
  'ReceiptScan',
  'AccountDelete',
]);

function resolveBannerUnitId(): string {
  const googleMobileAds = getGoogleMobileAdsModule();
  if (__DEV__) {
    return googleMobileAds?.TestIds.BANNER ?? 'test-banner-unavailable';
  }

  return Platform.OS === 'ios' ? IOS_BANNER_UNIT_ID : ANDROID_BANNER_UNIT_ID;
}

export function AdBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { isPremium } = useAds();
  const route = useRoute();
  const routeName = typeof route.name === 'string' ? route.name : '';
  const googleMobileAds = getGoogleMobileAdsModule();
  const unitId = resolveBannerUnitId();

  let blockedReason: string | null = null;

  if (isPremium) {
    blockedReason = 'premium';
  }

  if (!blockedReason && BLOCKED_ROUTE_NAMES.has(routeName)) {
    blockedReason = 'blocked_route';
  }

  if (!blockedReason && !ALLOWED_ROUTE_NAMES.has(routeName)) {
    blockedReason = 'route_not_allowed';
  }

  if (!blockedReason && !googleMobileAds) {
    blockedReason = 'module_unavailable';
  }

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    console.info('[ads][dev] banner-guard', {
      isPremium,
      routeName,
      blockedReason,
      unitId,
    });
  }, [blockedReason, isPremium, routeName, unitId]);

  if (blockedReason || !googleMobileAds) {
    return null;
  }

  const BannerAdComponent = googleMobileAds.BannerAd as unknown as ComponentType<{
    unitId: string;
    size: string | number;
  }>;
  const bannerSize = googleMobileAds.BannerAdSize.ANCHORED_ADAPTIVE_BANNER;

  return (
    <View style={[styles.container, style]}>
      <BannerAdComponent unitId={unitId} size={bannerSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    width: '100%',
  },
});
