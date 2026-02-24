import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETED_KEY = 'finsight:onboarding-completed';

export async function getOnboardingCompleted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  try {
    if (completed) {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
      return;
    }

    await AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  } catch {
    // Keep onboarding flow non-blocking even if local persistence fails.
  }
}

