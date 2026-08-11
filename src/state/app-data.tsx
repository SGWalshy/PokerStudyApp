import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

import { HandRecord, HandReview, ReviewStatus } from '@/components/hand-review/types';
import { HandDraft } from '@/components/log-hand/types';
import { loadActiveGoals, saveActiveGoals } from '@/utils/active-goals-storage';
import {
  BankrollTransaction,
  loadBankroll,
  loadStartingBankroll,
  saveBankroll,
  saveStartingBankroll,
} from '@/utils/bankroll-storage';
import { CurrencyCode, DEFAULT_CURRENCY } from '@/utils/currency';
import { ActiveGoal, GoalMetric, GoalPeriod } from '@/utils/goal-templates';
import {
  GoalHistoryEntry,
  GoalProgress,
  computeActiveGoalProgress,
  computeGoalHistory,
} from '@/utils/goal-progress';
import { DEFAULT_GOAL_TARGETS, WeeklyGoalTargets, loadGoalTargets, saveGoalTargets } from '@/utils/goals-storage';
import { Group, generateInviteCode, loadGroups, saveGroups } from '@/utils/groups-storage';
import { draftToRecord, loadHandRecords, saveHandRecords } from '@/utils/hand-storage';
import { loadSavedLocations, saveSavedLocations } from '@/utils/locations-storage';
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_PROFILE,
  NotificationPrefs,
  Profile,
  loadCurrency,
  loadNotificationPrefs,
  loadProfile,
  saveCurrency,
  saveNotificationPrefs,
  saveProfile,
} from '@/utils/settings-storage';
import {
  ActivityHeatmap,
  BankrollHistoryPoint,
  BankrollTotals,
  CashStats,
  TournamentStats,
  WeekHistoryEntry,
  WeeklyProgress,
  computeActivityHeatmap,
  computeBankrollHistory,
  computeBankrollTotals,
  computeCashStats,
  computeTournamentStats,
  currentStreak,
  longestStreak,
  weeklyHistory,
  weeklyProgress,
} from '@/utils/stats';

export interface NewActiveGoal {
  label: string;
  target: number;
  unit: string;
  period: GoalPeriod;
  metric: GoalMetric;
  color: string;
}

interface AppDataContextValue {
  loading: boolean;

  hands: HandRecord[];
  addHand: (draft: HandDraft) => HandRecord;
  updateHandReview: (id: string, review: HandReview, status: ReviewStatus) => void;
  updateHandDraft: (id: string, draft: HandDraft) => void;
  deleteHand: (id: string) => void;
  markHandReviewed: (id: string) => void;
  toggleHandFlag: (id: string) => void;

  bankroll: BankrollTransaction[];
  startingBankroll: number;
  addTransaction: (tx: Omit<BankrollTransaction, 'id' | 'loggedAt'>) => void;
  setStartingBankrollAmount: (amount: number) => void;

  savedLocations: string[];
  addSavedLocation: (location: string) => void;
  removeSavedLocation: (location: string) => void;

  goalTargets: WeeklyGoalTargets;
  setGoalTargets: (targets: WeeklyGoalTargets) => void;

  activeGoals: ActiveGoal[];
  addActiveGoal: (goal: NewActiveGoal) => void;
  updateActiveGoal: (id: string, updates: Partial<Pick<ActiveGoal, 'label' | 'target' | 'period' | 'color' | 'metric' | 'unit'>>) => void;
  removeActiveGoal: (id: string) => void;

  groups: Group[];
  createGroup: (name: string) => Group;
  joinGroup: (code: string) => Group | null;
  shareHandToGroup: (groupId: string, handId: string, note: string) => void;

  profile: Profile;
  setProfile: (profile: Profile) => void;

  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;

  notificationPrefs: NotificationPrefs;
  setNotificationPrefs: (prefs: NotificationPrefs) => void;

  resetAllData: () => Promise<void>;

  stats: {
    currentStreak: number;
    longestStreak: number;
    weeklyProgress: WeeklyProgress;
    weeklyHistory: WeekHistoryEntry[];
    bankrollTotals: BankrollTotals;
    cashStats: CashStats;
    tournamentStats: TournamentStats;
    bankrollHistory: BankrollHistoryPoint[];
    activeGoalProgress: GoalProgress[];
    activeGoalHistory: Record<string, GoalHistoryEntry[]>;
    activityHeatmap: ActivityHeatmap;
  };
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);

  const [hands, setHands] = useState<HandRecord[]>([]);
  const [bankroll, setBankroll] = useState<BankrollTransaction[]>([]);
  const [startingBankroll, setStartingBankrollState] = useState(0);
  const [goalTargets, setGoalTargetsState] = useState<WeeklyGoalTargets>(DEFAULT_GOAL_TARGETS);
  const [activeGoals, setActiveGoals] = useState<ActiveGoal[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE);
  const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  const loadedRef = useRef(false);

  useEffect(() => {
    Promise.all([
      loadHandRecords(),
      loadBankroll(),
      loadStartingBankroll(),
      loadGoalTargets(),
      loadActiveGoals(),
      loadGroups(),
      loadSavedLocations(),
      loadProfile(),
      loadCurrency(),
      loadNotificationPrefs(),
    ]).then(([h, b, sb, gt, ag, g, sl, pr, cur, np]) => {
      setHands(h);
      setBankroll(b);
      setStartingBankrollState(sb);
      setGoalTargetsState(gt);
      setActiveGoals(ag);
      setGroups(g);
      setSavedLocations(sl);
      setProfileState(pr);
      setCurrencyState(cur);
      setNotificationPrefsState(np);
      setLoading(false);
      loadedRef.current = true;
    });
  }, []);

  useEffect(() => { if (loadedRef.current) saveHandRecords(hands); }, [hands]);
  useEffect(() => { if (loadedRef.current) saveBankroll(bankroll); }, [bankroll]);
  useEffect(() => { if (loadedRef.current) saveStartingBankroll(startingBankroll); }, [startingBankroll]);
  useEffect(() => { if (loadedRef.current) saveGoalTargets(goalTargets); }, [goalTargets]);
  useEffect(() => { if (loadedRef.current) saveActiveGoals(activeGoals); }, [activeGoals]);
  useEffect(() => { if (loadedRef.current) saveGroups(groups); }, [groups]);
  useEffect(() => { if (loadedRef.current) saveSavedLocations(savedLocations); }, [savedLocations]);
  useEffect(() => { if (loadedRef.current) saveProfile(profile); }, [profile]);
  useEffect(() => { if (loadedRef.current) saveCurrency(currency); }, [currency]);
  useEffect(() => { if (loadedRef.current) saveNotificationPrefs(notificationPrefs); }, [notificationPrefs]);

  const addHand = (draft: HandDraft): HandRecord => {
    const rec = draftToRecord(draft, `h_${Date.now()}`, new Date().toISOString());
    setHands(prev => [rec, ...prev]);
    return rec;
  };

  const updateHandReview = (id: string, review: HandReview, status: ReviewStatus) => {
    setHands(prev => prev.map(r => (r.id === id ? { ...r, review, status } : r)));
  };

  // Re-save from "swipe to edit" — re-derives every display field from the
  // edited draft (positions, cards, pot type/size can all have changed)
  // while keeping the same id/createdAt/review/status/flagged.
  const updateHandDraft = (id: string, draft: HandDraft) => {
    setHands(prev => prev.map(r => {
      if (r.id !== id) return r;
      const regenerated = draftToRecord(draft, r.id, r.createdAt);
      return { ...regenerated, review: r.review, status: r.status, flagged: r.flagged };
    }));
  };

  const deleteHand = (id: string) => {
    setHands(prev => prev.filter(r => r.id !== id));
  };

  // Quick "mark reviewed" from the list swipe action — same effect as
  // ticking it inside the full review modal, without opening it.
  const markHandReviewed = (id: string) => {
    setHands(prev => prev.map(r => (r.id === id
      ? { ...r, status: 'reviewed', review: { ...r.review, markedReviewed: true, reviewedAt: new Date().toISOString() } }
      : r)));
  };

  const toggleHandFlag = (id: string) => {
    setHands(prev => prev.map(r => (r.id === id ? { ...r, flagged: !r.flagged } : r)));
  };

  const addTransaction = (tx: Omit<BankrollTransaction, 'id' | 'loggedAt'>) => {
    const full: BankrollTransaction = {
      ...tx,
      id: `t_${Date.now()}`,
      loggedAt: new Date().toISOString(),
    };
    setBankroll(prev => [full, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };

  const setStartingBankrollAmount = (amount: number) => setStartingBankrollState(amount);

  const addSavedLocation = (location: string) => {
    const trimmed = location.trim();
    if (!trimmed) return;
    setSavedLocations(prev =>
      prev.some(l => l.toLowerCase() === trimmed.toLowerCase()) ? prev : [trimmed, ...prev]
    );
  };

  const removeSavedLocation = (location: string) => {
    setSavedLocations(prev => prev.filter(l => l !== location));
  };

  const setGoalTargets = (targets: WeeklyGoalTargets) => setGoalTargetsState(targets);

  const addActiveGoal = (goal: NewActiveGoal) => {
    const full: ActiveGoal = {
      id: `ag_${Date.now()}`,
      ...goal,
      addedAt: new Date().toISOString(),
    };
    setActiveGoals(prev => [...prev, full]);
  };

  const updateActiveGoal = (id: string, updates: Partial<Pick<ActiveGoal, 'label' | 'target' | 'period' | 'color'>>) => {
    setActiveGoals(prev => prev.map(g => (g.id === id ? { ...g, ...updates } : g)));
  };

  const removeActiveGoal = (id: string) => {
    setActiveGoals(prev => prev.filter(g => g.id !== id));
  };

  const createGroup = (name: string): Group => {
    const group: Group = {
      id: `g_${Date.now()}`,
      name,
      inviteCode: generateInviteCode(),
      createdAt: new Date().toISOString(),
      sharedHands: [],
    };
    setGroups(prev => [group, ...prev]);
    return group;
  };

  const joinGroup = (code: string): Group | null => {
    const normalized = code.trim().toUpperCase();
    const found = groups.find(g => g.inviteCode === normalized);
    return found ?? null;
  };

  const shareHandToGroup = (groupId: string, handId: string, note: string) => {
    setGroups(prev => prev.map(g => (
      g.id === groupId
        ? { ...g, sharedHands: [{ handId, note, sharedAt: new Date().toISOString() }, ...g.sharedHands] }
        : g
    )));
  };

  const setProfile = (next: Profile) => setProfileState(next);
  const setCurrency = (code: CurrencyCode) => setCurrencyState(code);
  const setNotificationPrefs = (prefs: NotificationPrefs) => setNotificationPrefsState(prefs);

  // Wipes every AsyncStorage key the app owns and resets in-memory state to
  // defaults, so the UI reflects the wipe immediately without an app
  // restart. loadedRef briefly toggled off so the reset doesn't get
  // re-persisted by the save effects before state settles.
  const resetAllData = async () => {
    loadedRef.current = false;
    await AsyncStorage.clear();
    setHands([]);
    setBankroll([]);
    setStartingBankrollState(0);
    setGoalTargetsState(DEFAULT_GOAL_TARGETS);
    setActiveGoals([]);
    setGroups([]);
    setSavedLocations([]);
    setProfileState(DEFAULT_PROFILE);
    setCurrencyState(DEFAULT_CURRENCY);
    setNotificationPrefsState(DEFAULT_NOTIFICATION_PREFS);
    loadedRef.current = true;
  };

  const stats = useMemo(() => {
    const bankrollTotals = computeBankrollTotals(bankroll, startingBankroll);
    const activeGoalHistory: Record<string, GoalHistoryEntry[]> = {};
    for (const goal of activeGoals) {
      activeGoalHistory[goal.id] = computeGoalHistory(goal, hands, bankroll, bankrollTotals);
    }
    return {
      currentStreak: currentStreak(hands, bankroll),
      longestStreak: longestStreak(hands, bankroll),
      weeklyProgress: weeklyProgress(hands, goalTargets),
      weeklyHistory: weeklyHistory(hands, goalTargets),
      bankrollTotals,
      cashStats: computeCashStats(bankroll),
      tournamentStats: computeTournamentStats(bankroll),
      bankrollHistory: computeBankrollHistory(bankroll, startingBankroll),
      activeGoalProgress: computeActiveGoalProgress(activeGoals, hands, bankroll, bankrollTotals),
      activeGoalHistory,
      activityHeatmap: computeActivityHeatmap(hands),
    };
  }, [hands, bankroll, startingBankroll, goalTargets, activeGoals]);

  const value: AppDataContextValue = {
    loading,
    hands,
    addHand,
    updateHandReview,
    updateHandDraft,
    deleteHand,
    markHandReviewed,
    toggleHandFlag,
    bankroll,
    startingBankroll,
    addTransaction,
    setStartingBankrollAmount,
    savedLocations,
    addSavedLocation,
    removeSavedLocation,
    goalTargets,
    setGoalTargets,
    activeGoals,
    addActiveGoal,
    updateActiveGoal,
    removeActiveGoal,
    groups,
    createGroup,
    joinGroup,
    shareHandToGroup,
    profile,
    setProfile,
    currency,
    setCurrency,
    notificationPrefs,
    setNotificationPrefs,
    resetAllData,
    stats,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
