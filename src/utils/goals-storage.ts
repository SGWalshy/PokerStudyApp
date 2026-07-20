import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'goals_v1';

export interface WeeklyGoalTargets {
  reviewHandsTarget: number;
  logHandsTarget: number;
  studySessionsTarget: number; // distinct active days per week
}

export const DEFAULT_GOAL_TARGETS: WeeklyGoalTargets = {
  reviewHandsTarget: 15,
  logHandsTarget: 20,
  studySessionsTarget: 3,
};

export async function loadGoalTargets(): Promise<WeeklyGoalTargets> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GOAL_TARGETS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_GOAL_TARGETS, ...parsed };
  } catch {
    return { ...DEFAULT_GOAL_TARGETS };
  }
}

export async function saveGoalTargets(targets: WeeklyGoalTargets): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  } catch {
    // Silent
  }
}
