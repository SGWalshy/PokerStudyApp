import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

const STREAK         = 12;
const LONGEST_STREAK = 21;

const WEEKLY_GOALS = [
  { id: '1', title: 'Review hands',   done: 8,  total: 15 },
  { id: '2', title: 'Study sessions', done: 2,  total: 3  },
  { id: '3', title: 'Log hands',      done: 12, total: 20 },
];

// true = completed that week, false = missed
const COMPLETION_HISTORY = [true, true, false, true];
const WEEK_LABELS = ['Jun 1', 'Jun 8', 'Jun 15', 'Jun 22'];

const LEAKS = [
  { id: '1', category: 'River bet sizing',     pct: 34 },
  { id: '2', category: 'Over-folding to 3-bets', pct: 28 },
];

export default function GoalsScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <Text style={styles.title}>Goals</Text>

          {/* ── Study streak ── */}
          <View style={styles.streakCard}>
            <View style={styles.streakMain}>
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={styles.streakNumber}>{STREAK}</Text>
              <Text style={styles.streakUnit}>day streak</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakRecord}>
              <Text style={styles.streakRecordLabel}>Personal best</Text>
              <Text style={styles.streakRecordValue}>{LONGEST_STREAK} days</Text>
            </View>
          </View>

          {/* ── Weekly goals ── */}
          <Text style={styles.sectionTitle}>This Week</Text>
          <View style={styles.card}>
            {WEEKLY_GOALS.map((g, i) => {
              const progress = g.done / g.total;
              return (
                <View
                  key={g.id}
                  style={[styles.goalRow, i < WEEKLY_GOALS.length - 1 && styles.goalRowBorder]}>
                  <View style={styles.goalTop}>
                    <Text style={styles.goalTitle}>{g.title}</Text>
                    <Text style={styles.goalCount}>
                      <Text style={styles.goalDone}>{g.done}</Text>
                      {` of ${g.total}`}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.trackFill, { flex: progress }]} />
                    <View style={{ flex: 1 - progress }} />
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Completion history ── */}
          <Text style={styles.sectionTitle}>Weekly History</Text>
          <View style={styles.card}>
            <View style={styles.historyRow}>
              {COMPLETION_HISTORY.map((completed, i) => (
                <View key={i} style={styles.historyItem}>
                  <View style={[styles.historyCircle, completed ? styles.circleGreen : styles.circleGrey]}>
                    {completed && <Text style={styles.circleTick}>✓</Text>}
                  </View>
                  <Text style={styles.historyLabel}>{WEEK_LABELS[i]}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── AI leak summary ── */}
          <Text style={styles.sectionTitle}>Top Leaks</Text>
          <View style={styles.leakCard}>
            <View style={styles.leakHeader}>
              <Text style={styles.leakTitle}>AI Analysis</Text>
              <Pressable style={({ pressed }) => [styles.analysisBtn, pressed && styles.dimmed]}>
                <Text style={styles.analysisBtnText}>Full Analysis</Text>
              </Pressable>
            </View>
            {LEAKS.map((leak, i) => (
              <View
                key={leak.id}
                style={[styles.leakRow, i < LEAKS.length - 1 && styles.leakRowBorder]}>
                <View style={styles.leakLeft}>
                  <View style={styles.leakDot} />
                  <Text style={styles.leakCategory}>{leak.category}</Text>
                </View>
                <Text style={styles.leakPct}>{leak.pct}%</Text>
              </View>
            ))}
            <Text style={styles.leakSub}>Based on your last 47 reviewed hands</Text>
          </View>

          {/* ── Edit Goals button ── */}
          <Pressable
            style={({ pressed }) => [styles.editBtn, pressed && styles.dimmed]}>
            <Text style={styles.editBtnText}>Edit Goals</Text>
          </Pressable>

          <View style={{ height: BottomTabInset + Spacing.three }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.background },
  safe:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.4,
    marginBottom: Spacing.three,
  },

  // Streak card
  streakCard: {
    backgroundColor: C.tint,
    borderRadius: 20,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  streakFire: {
    fontSize: 36,
    lineHeight: 44,
  },
  streakNumber: {
    fontSize: 56,
    fontWeight: '800',
    color: C.tintText,
    letterSpacing: -2,
    lineHeight: 60,
  },
  streakUnit: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(212,237,218,0.75)',
    marginBottom: 8,
  },
  streakDivider: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(212,237,218,0.25)',
    marginHorizontal: Spacing.three,
  },
  streakRecord: {
    alignItems: 'flex-end',
  },
  streakRecordLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(212,237,218,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  streakRecordValue: {
    fontSize: 20,
    fontWeight: '700',
    color: C.tintText,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },

  card: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },

  // Goal rows
  goalRow: {
    paddingVertical: 14,
  },
  goalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.backgroundSelected,
  },
  goalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  goalCount: {
    fontSize: 13,
    color: C.textSecondary,
  },
  goalDone: {
    fontWeight: '700',
    color: C.tint,
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
    borderRadius: 3,
  },

  // History
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.three,
  },
  historyItem: {
    alignItems: 'center',
    gap: 8,
  },
  historyCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleGreen: { backgroundColor: C.tint },
  circleGrey:  { backgroundColor: C.backgroundSelected },
  circleTick: {
    fontSize: 18,
    fontWeight: '700',
    color: C.tintText,
  },
  historyLabel: {
    fontSize: 11,
    color: C.textSecondary,
    fontWeight: '500',
  },

  // Leaks
  leakCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    marginBottom: Spacing.three,
  },
  leakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  leakTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  analysisBtn: {
    backgroundColor: C.tint,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  analysisBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.tintText,
  },
  leakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  leakRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.backgroundSelected,
  },
  leakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  leakDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C94040',
  },
  leakCategory: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
    flex: 1,
  },
  leakPct: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C94040',
    marginLeft: Spacing.two,
  },
  leakSub: {
    fontSize: 12,
    color: C.textSecondary,
    paddingTop: 6,
    paddingBottom: 4,
  },

  // Edit button
  editBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  editBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },

  dimmed: { opacity: 0.7 },
});
