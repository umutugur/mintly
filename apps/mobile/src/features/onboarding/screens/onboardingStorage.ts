import * as SecureStore from 'expo-secure-store';

const ONBOARDING_COMPLETED_KEY = 'finsight:onboarding-completed';

export async function getOnboardingCompleted(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  try {
    if (completed) {
      await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, 'true');
      return;
    }

    await SecureStore.deleteItemAsync(ONBOARDING_COMPLETED_KEY);
  } catch {
    // Keep onboarding flow non-blocking even if local persistence fails.
  }
}

