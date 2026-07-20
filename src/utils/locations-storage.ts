import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bankroll_locations_v1';

export async function loadSavedLocations(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSavedLocations(locations: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Silent — data available in-session even if write fails
  }
}
