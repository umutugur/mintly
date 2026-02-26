type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');

let cachedModule: GoogleMobileAdsModule | null | undefined;

export function getGoogleMobileAdsModule(): GoogleMobileAdsModule | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  try {
    cachedModule = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
    return cachedModule;
  } catch (error) {
    if (__DEV__) {
      console.info('[ads][dev] native module unavailable', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
    cachedModule = null;
    return cachedModule;
  }
}
