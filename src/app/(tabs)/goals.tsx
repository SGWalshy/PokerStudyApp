import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EditGoalModal } from '@/components/goals/edit-goal-modal';
import { EditGoalsModal } from '@/components/goals/edit-goals-modal';
import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { useAppData } from '@/state/app-data';
import { ActiveGoal, DEFAULT_GOAL_COLOR, PERIOD_SHORT_LABELS } from '@/utils/goal-templates';
import { weeklyGoalCompletionPct } from '@/utils/goal-progress';
import { daysRemainingInWeek, heatmapColor } from '@/utils/stats';

const C = Colors.light;

// The web tab bar (app-tabs.web.tsx) floats over the top ~76px of every screen.
// Goals has a clickable "Edit Goals" button up in that header row, so it
// needs extra clearance on web to stay clickable (same fix as Groups).
const WebTopClearance = Platform.OS === 'web' ? 60 : 0;

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function GoalsScreen() {
  const { stats } = useAppData();
  const { currentStreak, longestStreak, activeGoalProgress, activeGoalHistory, activityHeatmap } = stats;

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<ActiveGoal | null>(null);

  const weeklyPct = weeklyGoalCompletionPct(activeGoalProgress);
  const daysLeft = daysRemainingInWeek();

  // 28 cells -> 4 rows of 7, oldest week first
  const heatmapRows = [0, 1, 2, 3].map(r => activityHeatmap.cells.slice(r * 7, r * 7 + 7));

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Goals</Text>
            <Pressable
              onPress={() => setShowEditModal(true)}
              style={({ pressed }) => [styles.editGoalsBtn, pressed && styles.dimmed]}>
              <Text style={styles.editGoalsBtnText}>Edit Goals</Text>
            </Pressable>
          </View>

          {/* ── Streak + Weekly Progress ── */}
          <View style={styles.topRow}>
            <View style={[styles.topCard, styles.streakCard]}>
              <Text style={styles.streakLabel}>STUDY STREAK</Text>
              <View style={styles.streakMiddle}>
                <View style={styles.streakBig}>
                  <Text style={styles.streakNumber}>{currentStreak}</Text>
                  <Text style={styles.streakFire}>🔥</Text>
                </View>
                <Text style={styles.streakUnit}>days</Text>
              </View>
              <View style={styles.topDivider} />
              <Text style={styles.streakBest}>Best: {longestStreak} days</Text>
            </View>

            <View style={[styles.topCard, styles.weeklyCard]}>
              <Text style={styles.weeklyLabel}>WEEKLY PROGRESS</Text>
              <View style={styles.weeklyMiddle}>
                {weeklyPct === null ? (
                  <Text style={styles.weeklyNoGoals}>No weekly goals</Text>
                ) : (
                  <>
                    <Text style={styles.weeklyPct}>{weeklyPct}%</Text>
                    <Text style={styles.weeklyUnit}>of weekly goal</Text>
                  </>
                )}
              </View>
              <View style={styles.topDividerLight} />
              <Text style={styles.weeklyBottom}>
                {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining this week
              </Text>
            </View>
          </View>

          {/* ── Heatmap ── */}
          <View style={styles.heatmapCard}>
            <View style={styles.heatmapHeaderRow}>
              <Text style={styles.sectionTitle}>Study Activity — Last 28 Days</Text>
              <Text style={styles.heatmapStudyDays}>{activityHeatmap.daysActive} days active</Text>
            </View>
            <Text style={styles.heatmapSubtitle}>Days you logged or reviewed a hand</Text>

            <View style={styles.heatmapDayLabels}>
              {DAY_LABELS.map((d, i) => (
                <Text key={i} style={styles.heatmapDayLabel}>{d}</Text>
              ))}
            </View>

            <View style={styles.heatmapGrid}>
              {heatmapRows.map((row, r) => (
                <View key={r} style={styles.heatmapRow}>
                  {row.map((cell, c) => (
                    <View
                      key={c}
                      style={[styles.heatmapCell, { backgroundColor: heatmapColor(cell) }]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>

          {/* ── Active goals ── */}
          <Text style={styles.sectionTitle}>Active Goals</Text>
          {activeGoalProgress.length === 0 ? (
            <View style={styles.emptyGoals}>
              <Text style={styles.emptyGoalsIcon}>♠</Text>
              <Text style={styles.emptyGoalsTitle}>No goals yet</Text>
              <Text style={styles.emptyGoalsSub}>
                Add a few from Edit Goals to start tracking your progress.
              </Text>
              <Pressable
                onPress={() => setShowEditModal(true)}
                style={({ pressed }) => [styles.emptyGoalsBtn, pressed && styles.dimmed]}>
                <Text style={styles.emptyGoalsBtnText}>Add a goal</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.goalList}>
              {activeGoalProgress.map(({ goal, done, pct, completed }) => {
                const remaining = Math.max(0, goal.target - done);
                return (
                  <Pressable
                    key={goal.id}
                    onPress={() => setEditingGoal(goal)}
                    style={({ pressed }) => [
                      styles.goalCard,
                      { borderLeftColor: goal.color || DEFAULT_GOAL_COLOR },
                      pressed && styles.dimmed,
                    ]}>
                    <View style={styles.goalCardTop}>
                      <View style={styles.goalCardMiddle}>
                        <View style={styles.goalCardTitleRow}>
                          <Text style={[styles.goalCardTitle, completed && styles.goalCardTitleDone]}>
                            {goal.label}
                          </Text>
                          <Text style={styles.goalCardPeriod}>{PERIOD_SHORT_LABELS[goal.period]}</Text>
                        </View>
                        <Text style={styles.goalCardProgress}>
                          {done} of {goal.target} {goal.unit} · {remaining} remaining
                        </Text>
                      </View>
                      {completed ? (
                        <View style={styles.goalCheckBadge}>
                          <Text style={styles.goalCheckText}>✓</Text>
                        </View>
                      ) : (
                        <Text style={styles.goalPct}>{pct}%</Text>
                      )}
                    </View>
                    <View style={styles.goalTrack}>
                      <View style={[styles.goalTrackFill, { flex: completed ? 1 : pct / 100 }]} />
                      <View style={{ flex: completed ? 0 : 1 - pct / 100 }} />
                    </View>
                    {goal.period !== 'total' && (
                      <View style={styles.goalHistoryRow}>
                        {(activeGoalHistory[goal.id] ?? []).map((h, i) => (
                          <View
                            key={i}
                            style={[styles.goalHistoryDot, h.hit ? styles.goalHistoryDotHit : styles.goalHistoryDotMiss]}
                          />
                        ))}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ height: BottomTabInset + Spacing.six }} />
        </ScrollView>
      </SafeAreaView>

      <EditGoalsModal visible={showEditModal} onClose={() => setShowEditModal(false)} />
      <EditGoalModal goal={editingGoal} onClose={() => setEditingGoal(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.background },
  safe:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three + WebTopClearance },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.4,
  },
  editGoalsBtn: {
    borderWidth: 1.5,
    borderColor: C.tint,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editGoalsBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },

  // Streak + Weekly side-by-side row
  topRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  topCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 168,
  },
  topDivider: {
    width: '70%',
    height: 1,
    backgroundColor: 'rgba(212,237,218,0.25)',
    marginTop: Spacing.two,
    marginBottom: 8,
  },
  topDividerLight: {
    width: '70%',
    height: 1,
    backgroundColor: C.backgroundSelected,
    marginTop: Spacing.two,
    marginBottom: 8,
  },

  streakCard: { backgroundColor: C.tint },
  streakLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(212,237,218,0.75)',
    letterSpacing: 1,
  },
  streakMiddle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBig: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakNumber: {
    fontSize: 34,
    fontWeight: '800',
    color: C.tintText,
    letterSpacing: -1,
  },
  streakFire: { fontSize: 22 },
  streakUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(212,237,218,0.7)',
    marginTop: 2,
  },
  streakBest: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(212,237,218,0.65)',
  },

  weeklyCard: { backgroundColor: C.backgroundElement },
  weeklyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSecondary,
    letterSpacing: 1,
  },
  weeklyMiddle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyPct: {
    fontSize: 34,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -1,
  },
  weeklyUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    marginTop: 2,
  },
  weeklyNoGoals: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textSecondary,
  },
  weeklyBottom: {
    fontSize: 11,
    fontWeight: '600',
    color: C.tint,
    textAlign: 'center',
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Heatmap
  heatmapCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  heatmapHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  heatmapStudyDays: {
    fontSize: 12,
    fontWeight: '700',
    color: C.tint,
  },
  heatmapSubtitle: {
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: Spacing.three,
  },
  heatmapDayLabels: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  heatmapDayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: C.textSecondary,
  },
  heatmapGrid: { gap: 4 },
  heatmapRow: {
    flexDirection: 'row',
    gap: 4,
  },
  heatmapCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 4,
  },

  // Active goals
  goalList: { gap: Spacing.two, marginTop: Spacing.two },
  goalCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    padding: Spacing.three,
    borderLeftWidth: 4,
  },
  goalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  goalCardMiddle: { flex: 1 },
  goalCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 2,
  },
  goalCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    flexShrink: 1,
  },
  goalCardPeriod: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
  },
  goalCardTitleDone: {
    color: C.textSecondary,
    textDecorationLine: 'line-through',
  },
  goalCardProgress: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '500',
  },
  goalPct: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tint,
    marginLeft: Spacing.two,
  },
  goalCheckBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.two,
  },
  goalCheckText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.tintText,
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.backgroundSelected,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  goalTrackFill: {
    height: 6,
    backgroundColor: C.tint,
    borderRadius: 3,
  },
  goalHistoryRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: Spacing.two,
  },
  goalHistoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  goalHistoryDotHit: { backgroundColor: C.tint },
  goalHistoryDotMiss: { backgroundColor: C.backgroundSelected },

  // Empty goals state
  emptyGoals: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  emptyGoalsIcon: { fontSize: 56, color: C.tint, marginBottom: Spacing.two },
  emptyGoalsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    marginBottom: 4,
  },
  emptyGoalsSub: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.three,
    lineHeight: 19,
  },
  emptyGoalsBtn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyGoalsBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.tintText,
  },

  dimmed: { opacity: 0.7 },
});
