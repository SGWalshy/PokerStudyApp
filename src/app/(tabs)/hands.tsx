import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HandReviewModal } from '@/components/hand-review/hand-review-modal';
import { HandRecord, ReviewStatus } from '@/components/hand-review/types';
import { LogHandModal } from '@/components/log-hand/log-hand-modal';
import { autoHandName } from '@/components/log-hand/types';
import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { useAppData } from '@/state/app-data';

const C = Colors.light;

// ── Date formatting ───────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  const d    = new Date(isoString);
  const now  = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1)  return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const hrs = Math.floor(diffMins / 60);
    return `${hrs}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Status styling ─────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'unreviewed' | 'reviewed' | 'flagged';

const STATUS_COLOR: Record<ReviewStatus, string> = {
  unreviewed:  C.negative,
  in_progress: C.gold,
  reviewed:    C.tint,
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed:  'Unreviewed',
  in_progress: 'In Progress',
  reviewed:    'Reviewed',
};

const STATUS_BADGE_BG: Record<ReviewStatus, string> = {
  unreviewed:  C.negativeSoft,
  in_progress: C.goldSoft,
  reviewed:    C.positiveSoft,
};

const STATUS_BADGE_TEXT: Record<ReviewStatus, string> = {
  unreviewed:  C.negativeStrong,
  in_progress: C.goldStrong,
  reviewed:    C.tint,
};

// A record's draft carries whatever name the user typed on Tag & Save —
// falls back to the same auto-generated title the hand review screen uses
// so a never-renamed hand still reads as something sensible.
function handTitleFor(record: HandRecord): string {
  if (!record.draft) return record.displayPositions;
  return record.draft.handName.trim() || autoHandName(record.draft);
}

function notesPreviewFor(record: HandRecord): string | null {
  const trimmed = (record.draft?.notes ?? '').trim();
  if (!trimmed) return null;
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
}

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: 'all',        label: 'All'        },
  { key: 'unreviewed', label: 'Unreviewed' },
  { key: 'reviewed',   label: 'Reviewed'   },
  { key: 'flagged',    label: 'Flagged'    },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HandsScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const { hands: records, loading, addHand, updateHandReview } = useAppData();

  const [activeFilter, setActiveFilter] = useState<FilterTab>(
    (params.filter as FilterTab) ?? 'all'
  );
  const [search, setSearch]             = useState('');
  const [showLog, setShowLog]           = useState(false);
  const [reviewRecord, setReviewRecord] = useState<HandRecord | null>(null);

  // Tabs stay mounted, so re-apply an incoming filter param on every navigation
  useEffect(() => {
    if (params.filter) setActiveFilter(params.filter as FilterTab);
  }, [params.filter]);

  const handleSave = (draft: Parameters<typeof addHand>[0]) => {
    addHand(draft);
  };

  const handleReviewUpdate = (id: string, review: Parameters<typeof updateHandReview>[1], status: ReviewStatus) => {
    updateHandReview(id, review, status);
    setReviewRecord(prev => prev?.id === id ? { ...prev, review, status } : prev);
  };

  const filtered = records.filter(r => {
    if (activeFilter === 'unreviewed' && r.status !== 'unreviewed') return false;
    if (activeFilter === 'reviewed'   && r.status !== 'reviewed')   return false;
    if (activeFilter === 'flagged'    && !r.flagged)                return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.displayPositions.toLowerCase().includes(q) &&
          !r.displayHoleCards.toLowerCase().includes(q)) return false;
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
            onPress={() => setShowLog(true)}
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
          {FILTERS.map(f => (
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
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        {/* Hand list */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={C.tint} />
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>♠</Text>
                <Text style={styles.emptyTitle}>
                  {records.length === 0 ? 'No hands logged yet' : 'No hands match your filter'}
                </Text>
                {records.length === 0 && (
                  <Text style={styles.emptyHint}>
                    Tap "+ Log Hand" to record your first hand.
                  </Text>
                )}
              </View>
            ) : (
              filtered.map(record => (
                <Pressable
                  key={record.id}
                  onPress={() => setReviewRecord(record)}
                  style={({ pressed }) => [
                    styles.handCard,
                    { borderLeftWidth: 3, borderLeftColor: STATUS_COLOR[record.status] },
                    pressed && styles.dimmed,
                  ]}>
                  <View style={styles.handTop}>
                    <View style={styles.handLeft}>
                      <View style={styles.handTitleRow}>
                        <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[record.status] }]} />
                        <Text style={styles.handTitle}>{handTitleFor(record)}</Text>
                        {record.flagged && <Text style={styles.flagIcon}> 🚩</Text>}
                      </View>
                      {notesPreviewFor(record) && (
                        <Text style={styles.handNotesPreview}>{notesPreviewFor(record)}</Text>
                      )}
                      <Text style={styles.handMeta}>
                        {record.displayPotType} · {record.displayStreet} · {record.displayPotSize} BB pot
                      </Text>
                      {/* Study flags summary */}
                      {(() => {
                        const allFlags = [
                          ...new Set([
                            ...Object.values(record.review.actionNotes).flatMap(n => n.flags),
                            ...Object.values(record.review.streetNotes).flatMap(n => n.flags),
                          ])
                        ].slice(0, 3);
                        if (allFlags.length === 0) return null;
                        return (
                          <View style={styles.flagChipRow}>
                            {allFlags.map(f => (
                              <View key={f} style={styles.miniFlag}>
                                <Text style={styles.miniFlagText}>{f}</Text>
                              </View>
                            ))}
                          </View>
                        );
                      })()}
                    </View>
                    <View style={styles.handRight}>
                      <View style={[styles.statusBadge, { backgroundColor: STATUS_BADGE_BG[record.status] }]}>
                        <Text style={[styles.statusBadgeText, { color: STATUS_BADGE_TEXT[record.status] }]}>
                          {STATUS_LABEL[record.status]}
                        </Text>
                      </View>
                      <Text style={styles.handDate}>{formatDate(record.createdAt)}</Text>
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <LogHandModal
        visible={showLog}
        onClose={() => setShowLog(false)}
        onSave={handleSave}
      />

      <HandReviewModal
        visible={reviewRecord !== null}
        record={reviewRecord}
        allRecords={records}
        onClose={() => setReviewRecord(null)}
        onUpdate={handleReviewUpdate}
        onOpenRecord={r => setReviewRecord(r)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  title:      { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  logBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.tint, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, gap: 4 },
  logBtnPlus: { fontSize: 18, fontWeight: '400', color: C.tintText, lineHeight: 20 },
  logBtnText: { fontSize: 14, fontWeight: '600', color: C.tintText },

  filterScroll: { flexGrow: 0 },
  filterRow:    { flexDirection: 'row', paddingHorizontal: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.two },
  filterBadge:  { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.backgroundElement },
  filterBadgeActive: { backgroundColor: C.tint },
  filterText:   { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  filterTextActive: { color: C.tintText },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.four, marginBottom: Spacing.two, backgroundColor: C.backgroundElement, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchIcon:  { fontSize: 18, color: C.textSecondary, transform: [{ scaleX: -1 }] },
  searchInput: { flex: 1, fontSize: 15, color: C.text, padding: 0 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list:        { flex: 1 },
  listContent: { paddingHorizontal: Spacing.four, paddingBottom: BottomTabInset + Spacing.six, gap: Spacing.two },

  emptyWrap:   { flex: 1, alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon:   { fontSize: 56, color: C.tint, marginBottom: Spacing.two },
  emptyTitle:  { fontSize: 17, fontWeight: '600', color: C.textSecondary, textAlign: 'center' },
  emptyHint:   { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },

  handCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    padding: Spacing.three,
    overflow: 'hidden',
  },
  handTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  handLeft:     { flex: 1, marginRight: Spacing.two, gap: 4 },
  handTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  statusDot:    { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  handTitle:    { fontSize: 15, fontWeight: '700', color: C.text },
  flagIcon:     { fontSize: 13 },
  handNotesPreview: { fontSize: 12, color: C.textSecondary, marginLeft: 15 },
  handMeta:     { fontSize: 13, color: C.textSecondary, marginLeft: 15 },
  handRight:    { alignItems: 'flex-end', gap: 6 },
  statusBadge:  { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  handDate:     { fontSize: 12, color: C.textSecondary },

  flagChipRow:  { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginLeft: 15 },
  miniFlag:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.backgroundSelected, borderColor: 'transparent' },
  miniFlagText: { fontSize: 9, fontWeight: '700', color: C.textSecondary },

  dimmed:    { opacity: 0.7 },
});
