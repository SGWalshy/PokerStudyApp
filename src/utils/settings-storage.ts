import AsyncStorage from '@react-native-async-storage/async-storage';

import { CurrencyCode, DEFAULT_CURRENCY } from '@/utils/currency';

const PROFILE_KEY = 'profile_v1';
const CURRENCY_KEY = 'currency_v1';
const NOTIFICATIONS_KEY = 'notification_prefs_v1';

export interface Profile {
  name: string;
  email: string;
}

export const DEFAULT_PROFILE: Profile = { name: '', email: '' };

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Silent
  }
}

export async function loadCurrency(): Promise<CurrencyCode> {
  try {
    const raw = await AsyncStorage.getItem(CURRENCY_KEY);
    return (raw as CurrencyCode) || DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export async function saveCurrency(code: CurrencyCode): Promise<void> {
  try {
    await AsyncStorage.setItem(CURRENCY_KEY, code);
  } catch {
    // Silent
  }
}

export interface NotificationPrefs {
  dailyReminder: boolean;
  reminderTime: string; // "HH:MM", 24-hour
  weeklyGoalReminder: boolean;
  streakAtRiskWarning: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyReminder: false,
  reminderTime: '08:00',
  weeklyGoalReminder: false,
  streakAtRiskWarning: false,
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    return { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(prefs));
  } catch {
    // Silent
  }
}
