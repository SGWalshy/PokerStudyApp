import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

const STREAK = 7;
const GOAL_DONE = 12;
const GOAL_TOTAL = 20;
const BANKROLL = 2450;
const WEEKLY_CHANGE = 180;
const REVIEW_COUNT = 8;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const progress = GOAL_DONE / GOAL_TOTAL;

  return (
    <View style={styles.root}>
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
            <View style={styles.streakBadge}>
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={styles.streakCount}>{STREAK}</Text>
            </View>
          </View>

          {/* Weekly Goal */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Weekly Goal</Text>
            <Text style={styles.cardStat}>
              <Text style={styles.statBold}>{GOAL_DONE}</Text>
              {` of ${GOAL_TOTAL} hands reviewed`}
            </Text>
            <View style={styles.track}>
              <View style={[styles.trackFill, { flex: progress }]} />
              <View style={{ flex: 1 - progress }} />
            </View>
          </View>

          {/* Bankroll */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Bankroll</Text>
            <View style={styles.row}>
              <Text style={styles.bigNumber}>${BANKROLL.toLocaleString()}</Text>
              <Text style={styles.positive}>+${WEEKLY_CHANGE} this week</Text>
            </View>
          </View>

          {/* Review Queue */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Review Queue</Text>
            <View style={styles.row}>
              <Text style={styles.queueCount}>{REVIEW_COUNT} hands waiting</Text>
              <Pressable
                style={({ pressed }) => [styles.reviewBtn, pressed && styles.dimmed]}>
                <Text style={styles.reviewBtnText}>Review</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.dimmed]}>
            <Text style={styles.primaryBtnText}>Log Hand</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.dimmed]}>
            <Text style={styles.secondaryBtnText}>Start Session</Text>
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
    paddingTop: Spacing.three,
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
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
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
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bigNumber: {
    fontSize: 30,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
  },
  positive: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },
  queueCount: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  reviewBtn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  reviewBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tintText,
  },

  // Bottom actions
  actions: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
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
