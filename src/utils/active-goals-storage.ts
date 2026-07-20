import AsyncStorage from '@react-native-async-storage/async-storage';

import { ActiveGoal } from '@/utils/goal-templates';

const STORAGE_KEY = 'active_goals_v1';

export async function loadActiveGoals(): Promise<ActiveGoal[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveActiveGoals(goals: ActiveGoal[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch {
    // Silent — data available in-session even if write fails
  }
}
