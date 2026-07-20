import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'groups_v1';

export interface SharedHand {
  handId: string;
  note: string;
  sharedAt: string; // ISO
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string; // ISO
  sharedHands: SharedHand[];
}

export async function loadGroups(): Promise<Group[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveGroups(groups: Group[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Silent
  }
}

export function generateInviteCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `POKER-${digits}`;
}
