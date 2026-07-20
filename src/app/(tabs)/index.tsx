import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { LogHandModal } from '@/components/log-hand/log-hand-modal';
import { HandDraft } from '@/components/log-hand/types';
import { useAppData } from '@/state/app-data';
import { CurrencyCode, formatMoney, formatMoneyCompact } from '@/utils/currency';
import { weeklyGoalCompletionPct } from '@/utils/goal-progress';
import { PERIOD_SHORT_LABELS } from '@/utils/goal-templates';
import { BankrollHistoryPoint } from '@/utils/stats';

const C = Colors.light;
const GRAPH_HEIGHT = 130;
const GRAPH_Y_AXIS_WIDTH = 44;

// The web tab bar (app-tabs.web.tsx) floats over the top ~76px of every
// screen. Every other screen with an interactive header element already
// compensates for this (see goals.tsx, groups.tsx) — Home needs the same
// now that its header has a tappable settings icon in that zone.
const WebTopClearance = Platform.OS === 'web' ? 60 : 0;

// A decorative trend graph, distinct from the full interactive one on the
// Bankroll tab — no tooltip or period picker, just a quick "which way is it
// going" glance with dollar reference lines for context. Points are spaced
// evenly by index rather than by time so it always fills the available
// width cleanly regardless of gaps between them.
function BankrollMiniGraph({ points, currency }: { points: BankrollHistoryPoint[]; currency: CurrencyCode }) {
  const [width, setWidth] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const height = GRAPH_HEIGHT;
  const totals = points.length > 0 ? points.map(p => p.runningTotal) : [0, 0];
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const mid = (min + max) / 2;
  const range = max - min || 1;
  const pad = 12;
  const plotHeight = height - pad * 2;

  function yFor(v: number) {
    return pad + plotHeight - ((v - min) / range) * plotHeight;
  }

  // Collapse to a single reference line when the range is flat (e.g. no
  // data yet) so the labels don't stack on top of each other.
  const gridLevels = min === max ? [max] : [max, mid, min];

  const coords = totals.length >= 2
    ? totals.map((t, i) => ({ x: (i / (totals.length - 1)) * width, y: yFor(t) }))
    : [{ x: 0, y: height / 2 }, { x: width, y: height / 2 }];
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const rising = totals[totals.length - 1] >= totals[0];

  return (
    <View style={styles.graphRow}>
      <View style={styles.graphYAxis}>
        {gridLevels.map((v, i) => (
          <Text
            key={i}
            style={[styles.graphYLabel, { top: Math.min(height - 13, Math.max(0, yFor(v) - 6)) }]}
            numberOfLines={1}>
            {formatMoneyCompact(v, currency)}
          </Text>
        ))}
      </View>
      <View style={styles.graphPlot} onLayout={onLayout}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {gridLevels.map((v, i) => (
              <Line key={i} x1={0} y1={yFor(v)} x2={width} y2={yFor(v)} stroke={C.backgroundSelected} strokeWidth={1} />
            ))}
            <Path d={path} stroke={rising ? C.tint : C.negative} strokeWidth={2.5} fill="none" />
          </Svg>
        )}
      </View>
    </View>
  );
}

// "2 goals in progress (1 daily, 1 monthly)" — only spelled out when goals
// span more than one cadence, since "2 goals in progress" already says it
// all when they're all the same period.
function describeGoalPeriods(goals: { goal: { period: keyof typeof PERIOD_SHORT_LABELS } }[]): string | null {
  const counts = new Map<string, number>();
  for (const g of goals) counts.set(g.goal.period, (counts.get(g.goal.period) ?? 0) + 1);
  if (counts.size <= 1) return null;
  const order: (keyof typeof PERIOD_SHORT_LABELS)[] = ['day', 'week', 'month', 'total'];
  return order
    .filter(p => counts.has(p))
    .map(p => `${counts.get(p)} ${PERIOD_SHORT_LABELS[p].toLowerCase()}`)
    .join(', ');
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { hands, addHand, stats, currency } = useAppData();
  const [logHandVisible, setLogHandVisible] = useState(false);

  const activeGoals = stats.activeGoalProgress;
  // The Home card only ever badges *this week's* completion — averaging in
  // daily/monthly/total goals here would make the "weekly goals" pill lie
  // about how the week is going. Monthly/total progress lives on the Goals tab.
  const goalsPct = weeklyGoalCompletionPct(activeGoals);
  const goalPeriodBreakdown = describeGoalPeriods(activeGoals);
  const bankrollTotal = stats.bankrollTotals.current;
  const weeklyChange = stats.bankrollTotals.weekChange;
  const reviewCount = hands.filter(h => h.status === 'unreviewed').length;

  const handleSaveHand = (draft: HandDraft) => {
    addHand(draft);
  };

  return (
    <View style={styles.root}>
      <LogHandModal
        visible={logHandVisible}
        onClose={() => setLogHandVisible(false)}
        onSave={handleSaveHand}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>Poker Study</Text>
              <Text style={styles.greeting}>{getGreeting()}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.streakBadge}>
                <Text style={styles.streakFire}>🔥</Text>
                <Text style={styles.streakCount}>{stats.currentStreak}</Text>
              </View>
              <Pressable
                onPress={() => router.push('/settings')}
                hitSlop={8}
                style={({ pressed }) => [styles.settingsBtn, pressed && styles.dimmed]}>
                <Ionicons name="settings-outline" size={20} color={C.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* Total bankroll + review queue, side by side */}
          <View style={styles.squareRow}>
            <View style={[styles.squareCard, styles.bankrollSquareCard]}>
              <Text style={styles.squareLabel}>Total Bankroll</Text>
              <Text style={[styles.squareBigNumber, styles.squareBigNumberTint]} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(bankrollTotal, currency)}
              </Text>
              <Text style={[styles.squareChange, weeklyChange < 0 && styles.negative]} numberOfLines={1}>
                {weeklyChange >= 0 ? '+' : '-'}{formatMoney(Math.abs(weeklyChange), currency)} this week
              </Text>
            </View>

            <Pressable
              onPress={() => router.push({ pathname: '/hands', params: { filter: 'unreviewed' } })}
              style={({ pressed }) => [styles.squareCard, styles.reviewSquareCard, pressed && styles.dimmed]}>
              <Text style={styles.squareLabel}>Review Queue</Text>
              <Text style={styles.squareBigNumber} numberOfLines={1} adjustsFontSizeToFit>
                {reviewCount}
              </Text>
              <Text style={styles.squareSubLabel} numberOfLines={1}>
                hand{reviewCount === 1 ? '' : 's'} waiting
              </Text>
              <View style={styles.reviewBtn}>
                <Text style={styles.reviewBtnText}>Review</Text>
              </View>
            </Pressable>
          </View>

          {/* Goals */}
          <View style={[styles.card, styles.goalsCard]}>
            <View style={styles.weeklyGoalHeaderRow}>
              <Text style={styles.cardLabel}>Goals</Text>
              {goalsPct !== null && (
                <View style={styles.weeklyGoalPctPill}>
                  <Text style={styles.weeklyGoalPct}>{goalsPct}%</Text>
                </View>
              )}
            </View>
            {activeGoals.length === 0 ? (
              <Text style={styles.cardStat}>No goals yet — add one from Goals</Text>
            ) : (
              <>
                <Text style={styles.cardStat}>
                  {activeGoals.length} goal{activeGoals.length === 1 ? '' : 's'} in progress
                  {goalPeriodBreakdown ? ` (${goalPeriodBreakdown})` : ''}
                </Text>
                {goalsPct !== null && (
                  <View style={styles.track}>
                    <View style={[styles.trackFill, styles.trackFillGold, { flex: goalsPct / 100 }]} />
                    <View style={{ flex: 1 - goalsPct / 100 }} />
                  </View>
                )}
              </>
            )}
          </View>

          {/* Bankroll graph */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Bankroll</Text>
            <BankrollMiniGraph points={stats.bankrollHistory.slice(-10)} currency={currency} />
          </View>
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => setLogHandVisible(true)}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.dimmed]}>
            <Text style={styles.primaryBtnText}>Log Hand</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/bankroll', params: { openAdd: 'session' } })}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.dimmed]}>
            <Text style={styles.secondaryBtnText}>Add Session</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three + WebTopClearance,
    paddingBottom: Spacing.two,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.four,
  },
  brand: {
    fontSize: 11,
    fontWeight: '500',
    color: C.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.positiveSoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 4,
    marginTop: 4,
  },
  streakFire: {
    fontSize: 15,
  },
  streakCount: {
    fontSize: 17,
    fontWeight: '700',
    color: C.tint,
  },

  // Cards
  card: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  goalsCard: {
    borderTopWidth: 3,
    borderTopColor: C.gold,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  weeklyGoalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyGoalPctPill: {
    backgroundColor: C.goldSoft,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginBottom: 8,
  },
  weeklyGoalPct: {
    fontSize: 14,
    fontWeight: '700',
    color: C.goldStrong,
  },
  cardStat: {
    fontSize: 16,
    color: C.text,
    marginBottom: 12,
  },
  statBold: {
    fontWeight: '700',
    color: C.text,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.backgroundSelected,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    backgroundColor: C.tint,
  },
  trackFillGold: {
    backgroundColor: C.gold,
  },
  positive: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },
  negative: {
    color: C.negative,
  },

  // Bankroll mini graph: Y-axis dollar labels to the left of the plot
  graphRow: {
    flexDirection: 'row',
  },
  graphYAxis: {
    width: GRAPH_Y_AXIS_WIDTH,
    height: GRAPH_HEIGHT,
    position: 'relative',
  },
  graphYLabel: {
    position: 'absolute',
    left: 0,
    fontSize: 10,
    fontWeight: '600',
    color: C.textSecondary,
  },
  graphPlot: {
    flex: 1,
    height: GRAPH_HEIGHT,
  },

  // Total bankroll + review queue squares
  squareRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  squareCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    borderTopWidth: 3,
    padding: Spacing.three,
    justifyContent: 'center',
    backgroundColor: C.backgroundElement,
  },
  bankrollSquareCard: {
    borderTopColor: C.tint,
  },
  reviewSquareCard: {
    borderTopColor: C.backgroundSelected,
  },
  squareLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  squareBigNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
  },
  squareBigNumberTint: {
    color: C.tint,
  },
  squareChange: {
    fontSize: 13,
    fontWeight: '600',
    color: C.tint,
    marginTop: 6,
  },
  squareSubLabel: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
  },
  reviewBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  reviewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.tintText,
  },

  // Bottom actions
  actions: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    // Device-tuned: Spacing.six (64) left too big a gap, Spacing.four (24)
    // still sat under the tab bar — 44 split the difference.
    paddingBottom: BottomTabInset + 44,
    gap: Spacing.two,
    backgroundColor: C.background,
  },
  primaryBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },
  secondaryBtn: {
    backgroundColor: C.background,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.tint,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.tint,
  },
  dimmed: {
    opacity: 0.7,
  },
});
