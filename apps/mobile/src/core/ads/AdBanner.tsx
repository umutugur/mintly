import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';

import { useRoute } from '@react-navigation/native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

import { useAds } from './AdProvider';

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
  if (__DEV__) {
    return TestIds.BANNER;
  }

  return Platform.OS === 'ios' ? IOS_BANNER_UNIT_ID : ANDROID_BANNER_UNIT_ID;
}

export function AdBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { isPremium } = useAds();
  const route = useRoute();
  const routeName = typeof route.name === 'string' ? route.name : '';

  if (isPremium) {
    return null;
  }

  if (BLOCKED_ROUTE_NAMES.has(routeName)) {
    return null;
  }

  if (!ALLOWED_ROUTE_NAMES.has(routeName)) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <BannerAd unitId={resolveBannerUnitId()} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
});
