import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getGoogleMobileAdsModule } from './mobileAdsModule';

const IOS_REWARDED_UNIT_ID = 'ca-app-pub-6114268066977057/7381135567';
const ANDROID_REWARDED_UNIT_ID = 'ca-app-pub-6114268066977057/1278761649';
const ADVISOR_USAGE_STORAGE_KEY = 'montly:advisor-insight-free-usage:v1';

type AdvisorUsageMap = Record<string, string>;
interface RewardedInsightAdOptions {
  onAdStarted?: () => void;
}

function getRewardedUnitId(): string {
  const googleMobileAds = getGoogleMobileAdsModule();
  if (__DEV__) {
    return googleMobileAds?.TestIds.REWARDED ?? 'test-rewarded-unavailable';
  }

  return Platform.OS === 'ios' ? IOS_REWARDED_UNIT_ID : ANDROID_REWARDED_UNIT_ID;
}

function getTodayLocalDayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readUsageMap(): Promise<AdvisorUsageMap> {
  const raw = await AsyncStorage.getItem(ADVISOR_USAGE_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as AdvisorUsageMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function writeUsageMap(value: AdvisorUsageMap): Promise<void> {
  await AsyncStorage.setItem(ADVISOR_USAGE_STORAGE_KEY, JSON.stringify(value));
}

export function getAdvisorUsageDayKey(): string {
  return getTodayLocalDayKey();
}

export async function hasUsedDailyAdvisorFreeUsage(
  userId: string,
  dayKey: string = getTodayLocalDayKey(),
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const map = await readUsageMap();
  return map[userId] === dayKey;
}

export async function markDailyAdvisorFreeUsage(userId: string, dayKey: string): Promise<void> {
  if (!userId) {
    return;
  }

  const map = await readUsageMap();
  map[userId] = dayKey;
  await writeUsageMap(map);
}

export async function showRewardedInsightAd(options?: RewardedInsightAdOptions): Promise<boolean> {
  const googleMobileAds = getGoogleMobileAdsModule();
  if (!googleMobileAds) {
    return false;
  }

  const rewardedAd = googleMobileAds.RewardedAd.createForAdRequest(getRewardedUnitId(), {
    requestNonPersonalizedAdsOnly: true,
  });

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let earnedReward = false;

    const cleanupHandlers: Array<(() => void) | undefined> = [];

    const finalize = (value: boolean) => {
      if (resolved) {
        return;
      }
      resolved = true;

      for (const unsubscribe of cleanupHandlers) {
        unsubscribe?.();
      }

      resolve(value);
    };

    cleanupHandlers.push(
      rewardedAd.addAdEventListener(googleMobileAds.RewardedAdEventType.LOADED, () => {
        try {
          rewardedAd.show();
        } catch {
          finalize(false);
        }
      }),
    );

    cleanupHandlers.push(
      rewardedAd.addAdEventListener(googleMobileAds.AdEventType.OPENED, () => {
        options?.onAdStarted?.();
      }),
    );

    cleanupHandlers.push(
      rewardedAd.addAdEventListener(googleMobileAds.RewardedAdEventType.EARNED_REWARD, () => {
        earnedReward = true;
      }),
    );

    cleanupHandlers.push(
      rewardedAd.addAdEventListener(googleMobileAds.AdEventType.CLOSED, () => {
        finalize(earnedReward);
      }),
    );

    cleanupHandlers.push(
      rewardedAd.addAdEventListener(googleMobileAds.AdEventType.ERROR, () => {
        finalize(false);
      }),
    );

    rewardedAd.load();
  });
}
