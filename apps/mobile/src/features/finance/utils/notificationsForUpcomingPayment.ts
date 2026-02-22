import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import i18next from 'i18next';

const STORAGE_KEY = 'mintly:upcoming-payment-notification-ids';
const REMINDER_DAYS = [3, 1] as const;

type NotificationMap = Record<string, string[]>;

function resolveLocale(input?: string): string {
  if (input && input.trim().length > 0) {
    return input;
  }

  return i18next.resolvedLanguage || i18next.language || 'en';
}

async function readMap(): Promise<NotificationMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as NotificationMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function writeMap(value: NotificationMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function buildReminderDate(dueDateIso: string, daysBefore: number): Date | null {
  const dueDate = new Date(dueDateIso);
  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const reminderDate = new Date(dueDate);
  reminderDate.setDate(reminderDate.getDate() - daysBefore);
  reminderDate.setHours(10, 0, 0, 0);

  return reminderDate;
}

async function ensurePermissionGranted(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function cancelUpcomingPaymentNotifications(upcomingPaymentId: string): Promise<void> {
  const map = await readMap();
  const ids = map[upcomingPaymentId] ?? [];

  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));

  if (upcomingPaymentId in map) {
    delete map[upcomingPaymentId];
    await writeMap(map);
  }
}

export async function rescheduleUpcomingPaymentNotifications(input: {
  upcomingPaymentId: string;
  title: string;
  dueDateIso: string;
  amount: number;
  currency: string;
  locale?: string;
}): Promise<void> {
  await cancelUpcomingPaymentNotifications(input.upcomingPaymentId);

  const permissionGranted = await ensurePermissionGranted();
  if (!permissionGranted) {
    return;
  }

  const locale = resolveLocale(input.locale);
  const title = i18next.t('upcoming.notifications.title', {
    title: input.title,
    lng: locale,
  });

  const scheduledIds: string[] = [];

  for (const daysBefore of REMINDER_DAYS) {
    const triggerDate = buildReminderDate(input.dueDateIso, daysBefore);
    if (!triggerDate || triggerDate.getTime() <= Date.now()) {
      continue;
    }

    const body = i18next.t('upcoming.notifications.body', {
      title: input.title,
      amount: formatMoney(input.amount, input.currency, locale),
      days: daysBefore,
      dueDate: new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
      }).format(new Date(input.dueDateIso)),
      lng: locale,
    });

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    scheduledIds.push(id);
  }

  if (scheduledIds.length === 0) {
    return;
  }

  const map = await readMap();
  map[input.upcomingPaymentId] = scheduledIds;
  await writeMap(map);
}
