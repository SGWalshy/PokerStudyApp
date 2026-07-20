import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bankroll_v1';
const STARTING_KEY = 'bankroll_starting_v1';

export type TransactionType = 'session' | 'expense' | 'deposit' | 'withdrawal';
export type ExpenseCategory = 'food' | 'travel' | 'training' | 'equipment' | 'other';

export interface BankrollTransaction {
  id: string;
  type: TransactionType;
  createdAt: string; // ISO — user-settable via the date field, defaults to today
  loggedAt: string; // ISO — real timestamp of when this entry was added, not user-editable; drives the daily streak

  // session fields (cash or tournament)
  location?: string;
  stakes?: string; // cash only
  gameType?: 'cash' | 'tournament';
  bigBlindAmount?: number; // $ value of one big blind — derived from the stakes preset, used for BB/hr
  hours?: number; // decimal hours (session duration, cash or tournament)
  buyIn?: number;
  cashOut?: number; // cash only
  finishPosition?: number; // tournament only
  prizeWon?: number; // tournament only
  totalEntrants?: number; // tournament only
  notes?: string; // session/tournament/deposit/withdrawal, optional

  // expense fields
  category?: ExpenseCategory;
  amount?: number; // positive magnitude — direction comes from `type`, not the sign (also used by deposit/withdrawal)
  description?: string;
}

export async function loadBankroll(): Promise<BankrollTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveBankroll(transactions: BankrollTransaction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // Silent — data available in-session even if write fails
  }
}

export async function loadStartingBankroll(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STARTING_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function saveStartingBankroll(amount: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STARTING_KEY, String(amount));
  } catch {
    // Silent
  }
}
