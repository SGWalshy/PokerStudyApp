import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

type GameType = 'cash' | 'tournament' | 'all';

interface Session {
  id: string;
  location: string;
  stakes: string;
  result: number;
  hours: string;
  type: 'cash' | 'tournament';
  chartLabel: string;
}

const SESSIONS: Session[] = [
  { id: '1', location: 'Aria',           stakes: '$2/$5',    result:   620, hours: '5h 20m', type: 'cash',       chartLabel: 'Today' },
  { id: '2', location: 'Bellagio',       stakes: '$1/$3',    result:  -140, hours: '3h 10m', type: 'cash',       chartLabel: 'Yest.'  },
  { id: '3', location: 'WSOP Main',      stakes: '$10,000',  result:-10000, hours: '2 days', type: 'tournament', chartLabel: 'Jun 23' },
  { id: '4', location: 'Wynn',           stakes: '$2/$5',    result:   340, hours: '4h 45m', type: 'cash',       chartLabel: 'Jun 22' },
  { id: '5', location: 'MGM Grand',      stakes: '$1/$2',    result:   -80, hours: '2h 30m', type: 'cash',       chartLabel: 'Jun 21' },
  { id: '6', location: 'Commerce',       stakes: '$5/$10',   result:  1250, hours: '7h 00m', type: 'cash',       chartLabel: 'Jun 20' },
  { id: '7', location: 'Bicycle Club',   stakes: '$2/$3',    result:   210, hours: '3h 40m', type: 'cash',       chartLabel: 'Jun 19' },
  { id: '8', location: 'PokerStars',     stakes: '$1,100',   result:  2800, hours: '3 days', type: 'tournament', chartLabel: 'Jun 18' },
];

const CHART_SESSIONS = [...SESSIONS].reverse(); // oldest → newest, left → right
const MAX_ABS = Math.max(...CHART_SESSIONS.map((s) => Math.abs(s.result)));

const GAME_FILTERS: { key: GameType; label: string }[] = [
  { key: 'cash',       label: 'Cash'       },
  { key: 'tournament', label: 'Tournament' },
  { key: 'all',        label: 'All'        },
];

const ADD_OPTIONS = [
  { key: 'session',  label: 'Win / Loss from session', icon: '♠' },
  { key: 'food',     label: 'Food & Drink expense',    icon: '🍽' },
  { key: 'other',    label: 'Other expense',           icon: '•••' },
];

export default function BankrollScreen() {
  const [gameType, setGameType]   = useState<GameType>('all');
  const [showModal, setShowModal] = useState(false);

  const filtered = SESSIONS.filter((s) => gameType === 'all' || s.type === gameType);

  const totalBankroll = 8240;
  const winRate       = 14.2;
  const hourlyRate    = 71;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Scrollable body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <Text style={styles.title}>Bankroll</Text>

          {/* Toggle */}
          <View style={styles.toggleRow}>
            {GAME_FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setGameType(f.key)}
                style={[styles.toggleBadge, gameType === f.key && styles.toggleActive]}>
                <Text style={[styles.toggleText, gameType === f.key && styles.toggleTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Bankroll card */}
          <View style={styles.bankrollCard}>
            <Text style={styles.bankrollLabel}>Total Bankroll</Text>
            <Text style={styles.bankrollAmount}>${totalBankroll.toLocaleString()}</Text>
            <View style={styles.bankrollChangePill}>
              <Text style={styles.bankrollChangeText}>+$620 this week</Text>
            </View>
          </View>

          {/* Stat row */}
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Win Rate</Text>
              <Text style={styles.statValue}>{winRate}</Text>
              <Text style={styles.statUnit}>BB / hr</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Hourly</Text>
              <Text style={styles.statValue}>${hourlyRate}</Text>
              <Text style={styles.statUnit}>per hour</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Sessions</Text>
              <Text style={styles.statValue}>{filtered.length}</Text>
              <Text style={styles.statUnit}>total</Text>
            </View>
          </View>

          {/* Bar chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Last 8 Sessions</Text>

            {/* Bar area */}
            <View style={styles.chartBars}>
              {/* zero line */}
              <View style={styles.zeroLine} />
              <View style={styles.barsRow}>
                {CHART_SESSIONS.map((s) => {
                  const isWin = s.result > 0;
                  const ratio = Math.abs(s.result) / MAX_ABS;
                  const barH  = Math.max(5, ratio * 72);
                  return (
                    <View key={s.id} style={styles.barWrap}>
                      {/* top half — win bar sits at bottom of this cell */}
                      <View style={styles.topHalf}>
                        {isWin && (
                          <View style={[styles.bar, styles.barWin, { height: barH }]} />
                        )}
                      </View>
                      {/* bottom half — loss bar sits at top of this cell */}
                      <View style={styles.bottomHalf}>
                        {!isWin && (
                          <View style={[styles.bar, styles.barLoss, { height: barH }]} />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Date labels */}
            <View style={styles.dateRow}>
              {CHART_SESSIONS.map((s) => (
                <Text key={s.id} style={styles.dateLabel} numberOfLines={1}>
                  {s.chartLabel}
                </Text>
              ))}
            </View>
          </View>

          {/* Recent sessions */}
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          <View style={styles.sessionList}>
            {filtered.map((s) => {
              const isWin = s.result > 0;
              const sign  = isWin ? '+' : '';
              return (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [styles.sessionCard, pressed && styles.dimmed]}>
                  <View style={styles.sessionLeft}>
                    <Text style={styles.sessionLocation}>{s.location}</Text>
                    <Text style={styles.sessionMeta}>{s.stakes} · {s.hours}</Text>
                  </View>
                  <Text style={[styles.sessionResult, isWin ? styles.resultWin : styles.resultLoss]}>
                    {sign}${Math.abs(s.result).toLocaleString()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* bottom padding so last card clears the pinned button */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Pinned Add Transaction button */}
        <View style={styles.addWrap}>
          <Pressable
            onPress={() => setShowModal(true)}
            style={({ pressed }) => [styles.addBtn, pressed && styles.dimmed]}>
            <Text style={styles.addBtnText}>+ Add Transaction</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Bottom sheet modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Add Transaction</Text>
          {ADD_OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.key}
              onPress={() => setShowModal(false)}
              style={({ pressed }) => [
                styles.sheetOption,
                i < ADD_OPTIONS.length - 1 && styles.sheetOptionBorder,
                pressed && styles.dimmed,
              ]}>
              <View style={styles.sheetIconWrap}>
                <Text style={styles.sheetIcon}>{opt.icon}</Text>
              </View>
              <Text style={styles.sheetOptionText}>{opt.label}</Text>
              <Text style={styles.sheetChevron}>›</Text>
            </Pressable>
          ))}
          <View style={{ height: BottomTabInset + Spacing.two }} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.4,
    marginBottom: Spacing.three,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    padding: 3,
    marginBottom: Spacing.three,
    gap: 3,
  },
  toggleBadge: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: C.tint },
  toggleText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  toggleTextActive: { color: C.tintText },

  // Bankroll card
  bankrollCard: {
    backgroundColor: C.tint,
    borderRadius: 20,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  bankrollLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(212,237,218,0.65)',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bankrollAmount: {
    fontSize: 52,
    fontWeight: '800',
    color: C.tintText,
    letterSpacing: -1.5,
    marginBottom: 12,
  },
  bankrollChangePill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  bankrollChangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(212,237,218,0.9)',
  },

  // Stat row
  statRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  statUnit: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 2,
  },

  // Chart
  chartCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    marginBottom: Spacing.three,
  },
  chartTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },
  chartBars: {
    height: 144,
    position: 'relative',
  },
  zeroLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: C.backgroundSelected,
    zIndex: 1,
  },
  barsRow: {
    flexDirection: 'row',
    height: 144,
  },
  barWrap: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: 3,
  },
  topHalf: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomHalf: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  bar: {
    borderRadius: 4,
  },
  barWin:  { backgroundColor: '#2E7D52' },
  barLoss: { backgroundColor: '#C94040' },

  // Date labels
  dateRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  dateLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 9,
    color: C.textSecondary,
    fontWeight: '500',
  },

  // Recent sessions
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },
  sessionList: { gap: Spacing.two },
  sessionCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionLeft: { flex: 1, marginRight: Spacing.two },
  sessionLocation: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 3,
  },
  sessionMeta: { fontSize: 13, color: C.textSecondary },
  sessionResult: { fontSize: 17, fontWeight: '700' },
  resultWin:  { color: '#2E7D52' },
  resultLoss: { color: '#C94040' },

  // Pinned button
  addWrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
    backgroundColor: C.background,
  },
  addBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },

  // Modal / bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.backgroundSelected,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: Spacing.three,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    gap: Spacing.three,
  },
  sheetOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.backgroundElement,
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetIcon: { fontSize: 18 },
  sheetOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  sheetChevron: {
    fontSize: 20,
    color: C.textSecondary,
    fontWeight: '300',
  },

  dimmed: { opacity: 0.7 },
});
