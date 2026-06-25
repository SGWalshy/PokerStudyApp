import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

type ReviewStatus = 'unreviewed' | 'in_progress' | 'reviewed';
type FilterTab = 'all' | 'unreviewed' | 'reviewed' | 'flagged';

interface Hand {
  id: string;
  positions: string;
  holeCards: string;
  potType: string;
  street: string;
  potSize: number;
  date: string;
  status: ReviewStatus;
  flagged: boolean;
}

const SAMPLE_HANDS: Hand[] = [
  { id: '1', positions: 'BTN vs BB', holeCards: 'KK', potType: '3-Bet', street: 'Flop', potSize: 42, date: 'Today', status: 'unreviewed', flagged: false },
  { id: '2', positions: 'CO vs BTN', holeCards: 'AQs', potType: 'SRP', street: 'Turn', potSize: 28, date: 'Today', status: 'in_progress', flagged: true },
  { id: '3', positions: 'UTG vs BB', holeCards: 'JJ', potType: '3-Bet', street: 'River', potSize: 115, date: 'Yesterday', status: 'reviewed', flagged: false },
  { id: '4', positions: 'HJ vs CO', holeCards: 'A5s', potType: 'SRP', street: 'Flop', potSize: 18, date: 'Yesterday', status: 'unreviewed', flagged: false },
  { id: '5', positions: 'SB vs BB', holeCards: 'KQo', potType: 'SRP', street: 'River', potSize: 67, date: 'Jun 23', status: 'reviewed', flagged: true },
  { id: '6', positions: 'BTN vs SB', holeCards: 'TT', potType: '4-Bet', street: 'Preflop', potSize: 200, date: 'Jun 22', status: 'unreviewed', flagged: false },
  { id: '7', positions: 'BB vs UTG', holeCards: '87s', potType: 'SRP', street: 'Turn', potSize: 34, date: 'Jun 21', status: 'in_progress', flagged: false },
  { id: '8', positions: 'CO vs SB', holeCards: 'AA', potType: '3-Bet', street: 'Flop', potSize: 98, date: 'Jun 20', status: 'reviewed', flagged: false },
];

const STATUS_DOT: Record<ReviewStatus, string> = {
  unreviewed: '#E05252',
  in_progress: '#D9874A',
  reviewed: '#2E7D52',
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed: 'Unreviewed',
  in_progress: 'In Progress',
  reviewed: 'Reviewed',
};

const STATUS_BADGE_BG: Record<ReviewStatus, string> = {
  unreviewed: '#FCE8E8',
  in_progress: '#FEF0E6',
  reviewed: '#E6F4EC',
};

const STATUS_BADGE_TEXT: Record<ReviewStatus, string> = {
  unreviewed: '#B83232',
  in_progress: '#A85A1A',
  reviewed: '#1A5C36',
};

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unreviewed', label: 'Unreviewed' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'flagged', label: 'Flagged' },
];

export default function HandsScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const filtered = SAMPLE_HANDS.filter((h) => {
    if (activeFilter === 'unreviewed' && h.status !== 'unreviewed') return false;
    if (activeFilter === 'reviewed' && h.status !== 'reviewed') return false;
    if (activeFilter === 'flagged' && !h.flagged) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!h.positions.toLowerCase().includes(q) && !h.holeCards.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Hands</Text>
          <Pressable
            style={({ pressed }) => [styles.logBtn, pressed && styles.dimmed]}>
            <Text style={styles.logBtnPlus}>+</Text>
            <Text style={styles.logBtnText}>Log Hand</Text>
          </Pressable>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={[styles.filterBadge, activeFilter === f.key && styles.filterBadgeActive]}>
              <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search hands…"
            placeholderTextColor={C.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Hand list */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}>
          {filtered.map((hand) => (
            <Pressable
              key={hand.id}
              style={({ pressed }) => [styles.handCard, pressed && styles.dimmed]}>
              <View style={styles.handTop}>
                <View style={styles.handLeft}>
                  <View style={styles.handTitleRow}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[hand.status] }]} />
                    <Text style={styles.handTitle}>{hand.positions}</Text>
                    <Text style={styles.handCards}> — {hand.holeCards}</Text>
                    {hand.flagged && <Text style={styles.flagIcon}> 🚩</Text>}
                  </View>
                  <Text style={styles.handMeta}>
                    {hand.potType} · {hand.street} · {hand.potSize} BB pot
                  </Text>
                </View>
                <View style={styles.handRight}>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_BADGE_BG[hand.status] }]}>
                    <Text style={[styles.statusBadgeText, { color: STATUS_BADGE_TEXT[hand.status] }]}>
                      {STATUS_LABEL[hand.status]}
                    </Text>
                  </View>
                  <Text style={styles.handDate}>{hand.date}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          {filtered.length === 0 && (
            <Text style={styles.emptyText}>No hands match your filter.</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.4,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 4,
  },
  logBtnPlus: {
    fontSize: 18,
    fontWeight: '400',
    color: C.tintText,
    lineHeight: 20,
  },
  logBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tintText,
  },

  filterScroll: { flexGrow: 0 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  filterBadge: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: C.backgroundElement,
  },
  filterBadgeActive: {
    backgroundColor: C.tint,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  filterTextActive: {
    color: C.tintText,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: {
    fontSize: 18,
    color: C.textSecondary,
    transform: [{ scaleX: -1 }],
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    padding: 0,
  },

  list: { flex: 1 },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
  },

  handCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    padding: Spacing.three,
  },
  handTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  handLeft: { flex: 1, marginRight: Spacing.two },
  handTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  handTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  handCards: {
    fontSize: 15,
    fontWeight: '600',
    color: C.tint,
  },
  flagIcon: {
    fontSize: 13,
  },
  handMeta: {
    fontSize: 13,
    color: C.textSecondary,
    marginLeft: 15,
  },
  handRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  handDate: {
    fontSize: 12,
    color: C.textSecondary,
  },

  emptyText: {
    textAlign: 'center',
    color: C.textSecondary,
    marginTop: Spacing.six,
    fontSize: 15,
  },
  dimmed: { opacity: 0.7 },
});
