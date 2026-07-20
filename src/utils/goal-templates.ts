export type GoalPeriod = 'day' | 'week' | 'month' | 'total';

// What real data source a goal's progress is pulled from. 'custom' means
// there's nothing in the app that logs it yet, so progress stays at 0 until
// a feature exists to track it.
export type GoalMetric =
  | 'hands_logged'
  | 'hands_reviewed'
  | 'sessions_played'
  | 'tournaments_played'
  | 'hours_studied'
  | 'concept_tags'
  | 'bankroll_amount'
  | 'bb_per_hour'
  | 'custom';

export const METRIC_LABELS: Record<GoalMetric, string> = {
  hands_logged: 'Hands logged',
  hands_reviewed: 'Hands reviewed',
  sessions_played: 'Sessions played',
  tournaments_played: 'Tournaments played',
  hours_studied: 'Hours played',
  concept_tags: 'Concept tags studied',
  bankroll_amount: 'Bankroll amount',
  bb_per_hour: 'BB / hour',
  custom: 'Custom (no auto-tracking)',
};

export const METRIC_UNITS: Record<GoalMetric, string> = {
  hands_logged: 'hands',
  hands_reviewed: 'hands',
  sessions_played: 'sessions',
  tournaments_played: 'tournaments',
  hours_studied: 'hours',
  concept_tags: 'tags',
  bankroll_amount: '$',
  bb_per_hour: 'BB/hr',
  custom: '',
};

// Metrics offered in the goal-creation and goal-editing "Track with" pickers.
// Both screens must draw from this single list — otherwise a metric can end
// up in the GoalMetric type (and tracked correctly by countForMetric) while
// being impossible to actually select/reassign in either picker.
export const METRIC_OPTIONS: GoalMetric[] = [
  'hands_reviewed',
  'hands_logged',
  'sessions_played',
  'tournaments_played',
  'hours_studied',
  'bankroll_amount',
  'bb_per_hour',
  'custom',
];

export const PERIOD_LABELS: Record<GoalPeriod, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  total: 'Total (no time limit)',
};

// Short form for the small grey timeframe tag shown on each goal card.
export const PERIOD_SHORT_LABELS: Record<GoalPeriod, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  total: 'Total',
};

export const PERIOD_SUFFIX: Record<GoalPeriod, string> = {
  day: 'per day',
  week: 'per week',
  month: 'per month',
  total: '',
};

export const GOAL_COLORS: string[] = [
  '#1B4332', // deep green
  '#C9A84C', // gold
  '#6B2737', // burgundy
  '#1B3A5C', // navy
  '#4A6FA5', // slate blue
  '#C4622D', // burnt orange
  '#6B4E8A', // dusty purple
  '#3A3A3A', // charcoal
];

export const DEFAULT_GOAL_COLOR = GOAL_COLORS[0];

export interface ActiveGoal {
  id: string;
  label: string;
  unit: string;
  target: number;
  period: GoalPeriod;
  metric: GoalMetric;
  color: string;
  addedAt: string; // ISO
}
