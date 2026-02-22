import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mintly:upcoming-payment-default-account-map';

type AccountPreferenceMap = Record<string, string>;

async function readMap(): Promise<AccountPreferenceMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as AccountPreferenceMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function writeMap(value: AccountPreferenceMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export async function setUpcomingPaymentPreferredAccount(
  upcomingPaymentId: string,
  accountId: string,
): Promise<void> {
  const map = await readMap();
  map[upcomingPaymentId] = accountId;
  await writeMap(map);
}

export async function getUpcomingPaymentPreferredAccount(
  upcomingPaymentId: string,
): Promise<string | null> {
  const map = await readMap();
  return map[upcomingPaymentId] ?? null;
}

export async function removeUpcomingPaymentPreferredAccount(
  upcomingPaymentId: string,
): Promise<void> {
  const map = await readMap();
  if (!(upcomingPaymentId in map)) {
    return;
  }

  delete map[upcomingPaymentId];
  await writeMap(map);
}
