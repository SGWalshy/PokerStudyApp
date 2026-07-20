import { HandRecord } from '@/components/hand-review/types';
import { BankrollTransaction } from '@/utils/bankroll-storage';
import { ActiveGoal, GoalMetric, GoalPeriod } from '@/utils/goal-templates';
import { BankrollTotals, getWeekStart } from '@/utils/stats';

const EPOCH = new Date(0);
const FAR_FUTURE = new Date(8640000000000000);

function getDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function getDayEnd(dayStart: Date): Date {
  const e = new Date(dayStart);
  e.setDate(e.getDate() + 1);
  return e;
}
function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function getWeekEnd(weekStart: Date): Date {
  const e = new Date(weekStart);
  e.setDate(e.getDate() + 7);
  return e;
}
function inRange(iso: string, start: Date, end: Date): boolean {
  const d = new Date(iso);
  return d >= start && d < end;
}

// The window for a given cadence, anchored to `now`. 'total' spans all time —
// there's nothing to reset, it's a running milestone.
export function periodWindow(period: GoalPeriod, now: Date): { start: Date; end: Date } {
  switch (period) {
    case 'day': {
      const start = getDayStart(now);
      return { start, end: getDayEnd(start) };
    }
    case 'month':
      return { start: getMonthStart(now), end: getMonthEnd(now) };
    case 'total':
      return { start: EPOCH, end: FAR_FUTURE };
    case 'week':
    default: {
      const start = getWeekStart(now);
      return { start, end: getWeekEnd(start) };
    }
  }
}

// The single place that maps a goal's metric to real app data within
// [start, end). Template goals and custom goals both flow through here —
// picking a metric in the custom-goal builder gets the exact same tracking
// as a built-in template. 'custom' has no data source yet, so it's always 0
// until something in the app actually logs it.
function countForMetric(
  metric: GoalMetric,
  hands: HandRecord[],
  bankroll: BankrollTransaction[],
  bankrollTotals: BankrollTotals,
  start: Date,
  end: Date
): number {
  switch (metric) {
    case 'hands_logged':
      return hands.filter(h => inRange(h.createdAt, start, end)).length;
    case 'hands_reviewed':
      return hands.filter(h => h.review.reviewedAt && inRange(h.review.reviewedAt, start, end)).length;
    case 'sessions_played':
      return bankroll.filter(t => t.type === 'session' && inRange(t.createdAt, start, end)).length;
    case 'tournaments_played':
      return bankroll.filter(t => t.type === 'session' && t.gameType === 'tournament' && inRange(t.createdAt, start, end)).length;
    case 'hours_studied':
      // No dedicated "study timer" exists — logged session hours is the closest real proxy.
      return bankroll
        .filter(t => t.type === 'session' && inRange(t.createdAt, start, end))
        .reduce((sum, t) => sum + (t.hours ?? 0), 0);
    case 'concept_tags': {
      const tags = new Set<string>();
      for (const h of hands) {
        if (h.review.reviewedAt && inRange(h.review.reviewedAt, start, end)) {
          h.review.conceptTags.forEach(t => tags.add(t));
        }
      }
      return tags.size;
    }
    case 'bankroll_amount':
      // A running total, not a per-period count — always "where you are right now".
      return Math.round(bankrollTotals.current);
    case 'bb_per_hour':
      return bankrollTotals.winRateBBPerHr !== null ? Math.round(bankrollTotals.winRateBBPerHr * 10) / 10 : 0;
    default:
      return 0;
  }
}

export interface GoalProgress {
  goal: ActiveGoal;
  done: number;
  pct: number;
  completed: boolean;
}

export function computeActiveGoalProgress(
  activeGoals: ActiveGoal[],
  hands: HandRecord[],
  bankroll: BankrollTransaction[],
  bankrollTotals: BankrollTotals,
  now: Date = new Date()
): GoalProgress[] {
  return activeGoals.map(goal => {
    const { start, end } = periodWindow(goal.period, now);
    const done = countForMetric(goal.metric, hands, bankroll, bankrollTotals, start, end);
    const pct = goal.target > 0 ? Math.min(100, Math.round((done / goal.target) * 100)) : 0;
    return { goal, done, pct, completed: goal.target > 0 && done >= goal.target };
  });
}

// Average completion across weekly-cadence goals only — monthly/total goals
// don't factor in, since they're not "this week" progress. Null when the
// user hasn't set any weekly goals, so callers can show an empty state
// instead of a misleading 0%.
export function weeklyGoalCompletionPct(progress: GoalProgress[]): number | null {
  const weekly = progress.filter(p => p.goal.period === 'week');
  if (weekly.length === 0) return null;
  return Math.round(weekly.reduce((sum, p) => sum + p.pct, 0) / weekly.length);
}

// Average completion across every active goal, regardless of cadence — each
// goal's pct is already relative to its own period window, so day/week/
// month/total goals mix into one honest "how am I doing overall" number.
// Used where there's no room to break progress out by period (e.g. the Home
// tab), unlike weeklyGoalCompletionPct which is deliberately this-week-only.
export function overallGoalCompletionPct(progress: GoalProgress[]): number | null {
  if (progress.length === 0) return null;
  return Math.round(progress.reduce((sum, p) => sum + p.pct, 0) / progress.length);
}

export interface GoalHistoryEntry {
  label: string;
  hit: boolean;
}

// Hit/miss for each of the last `periods` cycles of this goal's own cadence
// (day/week/month). Recomputed from raw timestamps each time — nothing is
// persisted, so it's always accurate even if the goal's target changes later.
// 'total' goals are a running milestone with no discrete cycles, so there's
// no history to show for them.
export function computeGoalHistory(
  goal: ActiveGoal,
  hands: HandRecord[],
  bankroll: BankrollTransaction[],
  bankrollTotals: BankrollTotals,
  periods = 4,
  now: Date = new Date()
): GoalHistoryEntry[] {
  if (goal.period === 'total') return [];

  const { start: currentStart } = periodWindow(goal.period, now);
  const entries: GoalHistoryEntry[] = [];

  for (let i = periods - 1; i >= 0; i--) {
    const start = new Date(currentStart);
    const label = goal.period === 'day'
      ? (() => { start.setDate(start.getDate() - i); return start.toLocaleDateString('en-US', { weekday: 'short' }); })()
      : goal.period === 'month'
      ? (() => { start.setMonth(start.getMonth() - i); return start.toLocaleDateString('en-US', { month: 'short' }); })()
      : (() => { start.setDate(start.getDate() - i * 7); return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })();

    const end = goal.period === 'day' ? getDayEnd(start)
      : goal.period === 'month' ? getMonthEnd(start)
      : getWeekEnd(start);

    const done = countForMetric(goal.metric, hands, bankroll, bankrollTotals, start, end);
    entries.push({ label, hit: done >= goal.target });
  }
  return entries;
}
