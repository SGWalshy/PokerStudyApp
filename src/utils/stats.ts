import { HandRecord, MistakeCategory, MISTAKE_CATEGORIES } from '@/components/hand-review/types';
import { BankrollTransaction } from '@/utils/bankroll-storage';
import { WeeklyGoalTargets } from '@/utils/goals-storage';

// ── Date helpers ─────────────────────────────────────────────────────────────

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Monday-start week
export function getWeekStart(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = start.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  start.setDate(start.getDate() + diff);
  return start;
}

function inWeek(dateIso: string, weekStart: Date): boolean {
  const d = new Date(dateIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

// Days from today through Sunday, inclusive (Monday -> 7, Saturday -> 2, Sunday -> 1).
export function daysRemainingInWeek(now: Date = new Date()): number {
  const weekStart = getWeekStart(now);
  const sunday = new Date(weekStart);
  sunday.setDate(sunday.getDate() + 6);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((sunday.getTime() - todayStart.getTime()) / 86400000) + 1);
}

// ── Streaks ──────────────────────────────────────────────────────────────────

// A day counts as "studied" if a hand was logged or reviewed on it. This is
// the single source of truth shared by the streak and the activity heatmap.
export function activeDayKeys(hands: HandRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const h of hands) {
    keys.add(dayKey(new Date(h.createdAt)));
    if (h.review.reviewedAt) keys.add(dayKey(new Date(h.review.reviewedAt)));
  }
  return keys;
}

// Broader than activeDayKeys — the daily streak also stays alive on days
// where the user logged any bankroll entry (a session, a deposit, an
// expense, anything), not just hand activity. The activity heatmap keeps
// its own narrower "studied" definition (activeDayKeys) since it's labeled
// specifically as hand study activity.
//
// Uses `loggedAt` (when the entry was actually added), not `createdAt`
// (the user-editable session date) — backfilling a tournament played
// yesterday should count toward today's streak, since today is when the
// user actually showed up and logged something.
function streakActiveDayKeys(hands: HandRecord[], bankroll: BankrollTransaction[]): Set<string> {
  const keys = activeDayKeys(hands);
  for (const tx of bankroll) {
    keys.add(dayKey(new Date(tx.loggedAt)));
  }
  return keys;
}

export function currentStreak(hands: HandRecord[], bankroll: BankrollTransaction[]): number {
  const keys = streakActiveDayKeys(hands, bankroll);
  let streak = 0;
  const cursor = new Date();
  while (keys.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function longestStreak(hands: HandRecord[], bankroll: BankrollTransaction[]): number {
  const keys = streakActiveDayKeys(hands, bankroll);
  if (keys.size === 0) return 0;
  const days = [...keys].map(k => {
    const [y, m, dd] = k.split('-').map(Number);
    return new Date(y, m, dd).getTime();
  }).sort((a, b) => a - b);

  let best = 1;
  let run = 1;
  const DAY_MS = 86400000;
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === DAY_MS ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

// ── Activity heatmap ─────────────────────────────────────────────────────────

export interface HeatmapCell {
  date: string; // ISO
  active: boolean;
  isFuture: boolean;
}

export interface ActivityHeatmap {
  cells: HeatmapCell[]; // exactly 28, oldest first, Monday-aligned in rows of 7
  daysActive: number;
}

function getDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function getDayEnd(dayStart: Date): Date {
  const e = new Date(dayStart);
  e.setDate(e.getDate() + 1);
  return e;
}

// Same "logged or reviewed" definition as the streak, over a 4-week,
// Monday-aligned grid ending with the current week.
export function computeActivityHeatmap(hands: HandRecord[], now: Date = new Date()): ActivityHeatmap {
  const keys = activeDayKeys(hands);
  const currentWeekStart = getWeekStart(now);
  const gridStart = new Date(currentWeekStart);
  gridStart.setDate(gridStart.getDate() - 21); // 3 weeks before the current one = 4 weeks total
  const todayEnd = getDayEnd(getDayStart(now));

  const cells: HeatmapCell[] = Array.from({ length: 28 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(day.getDate() + i);
    return { date: day.toISOString(), active: keys.has(dayKey(day)), isFuture: day >= todayEnd };
  });

  return { cells, daysActive: cells.filter(c => c.active).length };
}

// Binary: studied that day or not. Future days (haven't happened yet) get a
// faint version of the "not studied" cream so they read as not-yet-real.
export function heatmapColor(cell: HeatmapCell): string {
  if (cell.isFuture) return 'rgba(212,202,184,0.35)';
  return cell.active ? '#1B4332' : '#D4CAB8';
}

// ── Weekly progress ──────────────────────────────────────────────────────────

export interface WeeklyProgress {
  reviewDone: number;
  reviewTarget: number;
  logDone: number;
  logTarget: number;
  studyDone: number;
  studyTarget: number;
}

export function weeklyProgress(hands: HandRecord[], targets: WeeklyGoalTargets): WeeklyProgress {
  const weekStart = getWeekStart(new Date());
  const thisWeekHands = hands.filter(h => inWeek(h.createdAt, weekStart));
  const reviewedThisWeek = hands.filter(h => h.review.reviewedAt && inWeek(h.review.reviewedAt, weekStart));

  const activeDays = new Set<string>();
  for (const h of thisWeekHands) activeDays.add(dayKey(new Date(h.createdAt)));
  for (const h of reviewedThisWeek) activeDays.add(dayKey(new Date(h.review.reviewedAt!)));

  return {
    reviewDone: reviewedThisWeek.length,
    reviewTarget: targets.reviewHandsTarget,
    logDone: thisWeekHands.length,
    logTarget: targets.logHandsTarget,
    studyDone: activeDays.size,
    studyTarget: targets.studySessionsTarget,
  };
}

export interface WeekHistoryEntry {
  label: string;
  completed: boolean;
}

export function weeklyHistory(hands: HandRecord[], targets: WeeklyGoalTargets, weeks = 4): WeekHistoryEntry[] {
  const entries: WeekHistoryEntry[] = [];
  const thisWeekStart = getWeekStart(new Date());

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(thisWeekStart);
    weekStart.setDate(weekStart.getDate() - i * 7);

    const logDone = hands.filter(h => inWeek(h.createdAt, weekStart)).length;
    const reviewDone = hands.filter(h => h.review.reviewedAt && inWeek(h.review.reviewedAt, weekStart)).length;
    const activeDays = new Set<string>();
    for (const h of hands) {
      if (inWeek(h.createdAt, weekStart)) activeDays.add(dayKey(new Date(h.createdAt)));
      if (h.review.reviewedAt && inWeek(h.review.reviewedAt, weekStart)) activeDays.add(dayKey(new Date(h.review.reviewedAt)));
    }

    const completed =
      logDone >= targets.logHandsTarget &&
      reviewDone >= targets.reviewHandsTarget &&
      activeDays.size >= targets.studySessionsTarget;

    entries.push({
      label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      completed,
    });
  }
  return entries;
}

// ── Leaks ────────────────────────────────────────────────────────────────────

export interface LeakStat {
  category: MistakeCategory;
  label: string;
  pct: number;
}

const MISTAKE_LABELS: Record<MistakeCategory, string> = Object.fromEntries(
  MISTAKE_CATEGORIES.map(c => [c.key, c.label])
) as Record<MistakeCategory, string>;

export function topLeaks(hands: HandRecord[], limit = 2): LeakStat[] {
  const reviewed = hands.filter(h => h.status === 'reviewed');
  if (reviewed.length === 0) return [];

  const counts = new Map<MistakeCategory, number>();
  for (const h of reviewed) {
    for (const cat of h.review.mistakeCategories) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, count]) => ({
      category,
      label: MISTAKE_LABELS[category] ?? category,
      pct: Math.round((count / reviewed.length) * 100),
    }));
}

// ── Bankroll ─────────────────────────────────────────────────────────────────

export interface BankrollTotals {
  current: number;
  weekChange: number;
  winRateBBPerHr: number | null;
  hourlyRate: number | null;
  sessionCount: number;
}

// The single place a transaction's $ result is computed — reused by the
// bankroll screen's list/chart so they never drift from the totals below.
export function txResult(tx: BankrollTransaction): number {
  if (tx.type === 'session') {
    if (tx.gameType === 'tournament') return (tx.prizeWon ?? 0) - (tx.buyIn ?? 0);
    return (tx.cashOut ?? 0) - (tx.buyIn ?? 0);
  }
  if (tx.type === 'deposit') return tx.amount ?? 0;
  if (tx.type === 'withdrawal') return -(tx.amount ?? 0);
  return -(tx.amount ?? 0); // expense
}

export function computeBankrollTotals(
  transactions: BankrollTransaction[],
  startingBankroll: number
): BankrollTotals {
  const net = transactions.reduce((sum, tx) => sum + txResult(tx), 0);
  const current = startingBankroll + net;

  const weekStart = getWeekStart(new Date());
  const weekChange = transactions
    .filter(tx => inWeek(tx.createdAt, weekStart))
    .reduce((sum, tx) => sum + txResult(tx), 0);

  const cashSessions = transactions.filter(tx => tx.type === 'session' && tx.gameType === 'cash' && tx.hours);
  const totalHours = cashSessions.reduce((sum, tx) => sum + (tx.hours ?? 0), 0);
  const totalCashResult = cashSessions.reduce((sum, tx) => sum + txResult(tx), 0);
  const hourlyRate = totalHours > 0 ? totalCashResult / totalHours : null;

  const bbSessions = cashSessions.filter(tx => tx.bigBlindAmount && tx.bigBlindAmount > 0);
  const totalBBHours = bbSessions.reduce((sum, tx) => sum + (tx.hours ?? 0), 0);
  const totalBBResult = bbSessions.reduce((sum, tx) => sum + txResult(tx) / (tx.bigBlindAmount ?? 1), 0);
  const winRateBBPerHr = totalBBHours > 0 ? totalBBResult / totalBBHours : null;

  return {
    current,
    weekChange,
    winRateBBPerHr,
    hourlyRate,
    sessionCount: transactions.filter(tx => tx.type === 'session').length,
  };
}

// ── Cash / tournament split stats (Bankroll tab's unified stats section) ────

export interface CashStats {
  winRateBBPerHr: number | null;
  hourlyRate: number | null;
  sessionCount: number;
}

export function computeCashStats(transactions: BankrollTransaction[]): CashStats {
  const cashSessions = transactions.filter(tx => tx.type === 'session' && tx.gameType === 'cash');
  const withHours = cashSessions.filter(tx => tx.hours);
  const totalHours = withHours.reduce((sum, tx) => sum + (tx.hours ?? 0), 0);
  const totalResult = withHours.reduce((sum, tx) => sum + txResult(tx), 0);
  const hourlyRate = totalHours > 0 ? totalResult / totalHours : null;

  const bbSessions = withHours.filter(tx => tx.bigBlindAmount && tx.bigBlindAmount > 0);
  const totalBBHours = bbSessions.reduce((sum, tx) => sum + (tx.hours ?? 0), 0);
  const totalBBResult = bbSessions.reduce((sum, tx) => sum + txResult(tx) / (tx.bigBlindAmount ?? 1), 0);
  const winRateBBPerHr = totalBBHours > 0 ? totalBBResult / totalBBHours : null;

  return { winRateBBPerHr, hourlyRate, sessionCount: cashSessions.length };
}

export interface TournamentStats {
  roiPct: number | null;
  itmPct: number | null;
  tournamentCount: number;
}

export function computeTournamentStats(transactions: BankrollTransaction[]): TournamentStats {
  const tourneys = transactions.filter(tx => tx.type === 'session' && tx.gameType === 'tournament');
  const totalBuyIn = tourneys.reduce((sum, tx) => sum + (tx.buyIn ?? 0), 0);
  const totalPrize = tourneys.reduce((sum, tx) => sum + (tx.prizeWon ?? 0), 0);
  const roiPct = totalBuyIn > 0 ? ((totalPrize - totalBuyIn) / totalBuyIn) * 100 : null;
  const itmCount = tourneys.filter(tx => (tx.prizeWon ?? 0) > 0).length;
  const itmPct = tourneys.length > 0 ? (itmCount / tourneys.length) * 100 : null;
  return { roiPct, itmPct, tournamentCount: tourneys.length };
}

// ── Bankroll history (running total over time, for the line graph) ─────────

export interface BankrollHistoryPoint {
  id: string;
  date: string; // ISO
  result: number; // this session's txResult
  runningTotal: number; // bankroll total right after this transaction
}

// Only session (cash/tournament) transactions become plotted points — an
// expense between two sessions still shifts the running total, it just
// doesn't get its own dot on the graph.
export function computeBankrollHistory(
  transactions: BankrollTransaction[],
  startingBankroll: number
): BankrollHistoryPoint[] {
  const sorted = [...transactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let running = startingBankroll;
  const points: BankrollHistoryPoint[] = [];
  for (const tx of sorted) {
    running += txResult(tx);
    if (tx.type === 'session') {
      points.push({ id: tx.id, date: tx.createdAt, result: txResult(tx), runningTotal: running });
    }
  }
  return points;
}
