import { useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { useAppData } from '@/state/app-data';
import { Group } from '@/utils/groups-storage';
import { getWeekStart } from '@/utils/stats';

const C = Colors.light;

// The web tab bar (app-tabs.web.tsx) floats over the top ~76px of every screen.
// Groups is the one screen with primary actions (Join/Create, back button) that
// sit right in that zone, so it needs extra clearance on web to stay clickable.
const WebTopClearance = Platform.OS === 'web' ? 60 : 0;

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
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
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function handsSharedThisWeek(group: Group): number {
  const weekStart = getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return group.sharedHands.filter(s => {
    const d = new Date(s.sharedAt);
    return d >= weekStart && d < weekEnd;
  }).length;
}

function lastActivityLabel(group: Group): string {
  const latest = group.sharedHands[0]?.sharedAt ?? group.createdAt;
  return relativeTime(latest);
}

export default function GroupsScreen() {
  const { groups, hands, createGroup, joinGroup, shareHandToGroup } = useAppData();

  const [activeRoomId, setActiveRoomId]       = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal]     = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinCode, setJoinCode]               = useState('');
  const [joinError, setJoinError]             = useState('');
  const [createName, setCreateName]           = useState('');
  const [showShareModal, setShowShareModal]   = useState(false);
  const [shareHandId, setShareHandId]         = useState<string | null>(null);
  const [shareNote, setShareNote]             = useState('');

  const activeRoom = groups.find(g => g.id === activeRoomId) ?? null;

  function handleJoin() {
    const found = joinGroup(joinCode);
    if (found) {
      setJoinError('');
      setJoinCode('');
      setShowJoinModal(false);
      setActiveRoomId(found.id);
    } else {
      setJoinError('No group found with that code on this device.');
    }
  }

  function handleCreate() {
    if (!createName.trim()) return;
    const group = createGroup(createName.trim());
    setCreateName('');
    setShowCreateModal(false);
    setActiveRoomId(group.id);
  }

  function openShare() {
    setShareHandId(hands[0]?.id ?? null);
    setShareNote('');
    setShowShareModal(true);
  }

  function submitShare() {
    if (!activeRoom || !shareHandId) return;
    shareHandToGroup(activeRoom.id, shareHandId, shareNote.trim());
    setShowShareModal(false);
  }

  // ── Room feed view ──────────────────────────────────────────────────────────
  if (activeRoom) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* Room header */}
          <View style={styles.roomHeader}>
            <Pressable
              onPress={() => setActiveRoomId(null)}
              style={({ pressed }) => [styles.backBtn, pressed && styles.dimmed]}>
              <Text style={styles.backChevron}>‹</Text>
              <Text style={styles.backLabel}>Groups</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}>

            <View style={styles.roomTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.roomName}>{activeRoom.name}</Text>
                <Text style={styles.roomSubtitle}>
                  1 member (you) · code {activeRoom.inviteCode}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: Spacing.three }]}>Hand Feed</Text>

            {activeRoom.sharedHands.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>♠</Text>
                <Text style={styles.emptyTitle}>No hands shared yet</Text>
                <Text style={styles.emptySub}>Share a logged hand to start this group&apos;s feed</Text>
              </View>
            ) : (
              activeRoom.sharedHands.map((shared) => {
                const hand = hands.find(h => h.id === shared.handId);
                return (
                  <View key={`${shared.handId}_${shared.sharedAt}`} style={styles.feedCard}>
                    <View style={[styles.avatar, { backgroundColor: C.tint }]}>
                      <Text style={styles.avatarText}>YOU</Text>
                    </View>
                    <View style={styles.feedBody}>
                      <View style={styles.feedTopRow}>
                        <Text style={styles.feedMember}>You</Text>
                        <Text style={styles.feedTime}>{relativeTime(shared.sharedAt)}</Text>
                      </View>
                      <Text style={styles.feedDescription}>
                        {hand
                          ? `${hand.displayPositions} — ${hand.displayHoleCards}`
                          : 'Hand no longer available'}
                      </Text>
                      {shared.note ? <Text style={styles.feedNote}>{shared.note}</Text> : null}
                    </View>
                  </View>
                );
              })
            )}

            <View style={{ height: BottomTabInset + Spacing.six }} />
          </ScrollView>

          {/* Pinned Share button */}
          <View style={styles.addWrap}>
            <Pressable
              onPress={openShare}
              disabled={hands.length === 0}
              style={({ pressed }) => [styles.addBtn, (pressed || hands.length === 0) && styles.dimmed]}>
              <Text style={styles.addBtnText}>
                {hands.length === 0 ? 'Log a hand first to share' : '+ Share a Hand'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>

        {/* Share hand modal */}
        <Modal
          visible={showShareModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowShareModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowShareModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Share a Hand</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.handPickerScroll} showsVerticalScrollIndicator={false}
              onScrollBeginDrag={() => Keyboard.dismiss()}>
              {hands.map(h => (
                <Pressable
                  key={h.id}
                  onPress={() => setShareHandId(h.id)}
                  style={[styles.handPickerRow, shareHandId === h.id && styles.handPickerRowActive]}>
                  <Text style={styles.handPickerText}>
                    {h.displayPositions} — {h.displayHoleCards}
                  </Text>
                  {shareHandId === h.id && <Text style={styles.handPickerCheck}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.codeInput}
              placeholder="Add a note (optional)"
              placeholderTextColor={C.textSecondary}
              value={shareNote}
              onChangeText={setShareNote}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <Pressable
              onPress={submitShare}
              disabled={!shareHandId}
              style={({ pressed }) => [styles.sheetBtn, (pressed || !shareHandId) && styles.dimmed]}>
              <Text style={styles.sheetBtnText}>Share to Group</Text>
            </Pressable>
            <View style={{ height: BottomTabInset + Spacing.two }} />
          </View>
        </Modal>
      </View>
    );
  }

  // ── Group list view ─────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Groups</Text>
            <View style={styles.headerButtons}>
              <Pressable
                onPress={() => { setJoinError(''); setShowJoinModal(true); }}
                style={({ pressed }) => [styles.joinCodeBtn, pressed && styles.dimmed]}>
                <Text style={styles.joinCodeBtnText}>Join</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowCreateModal(true)}
                style={({ pressed }) => [styles.createBtn, pressed && styles.dimmed]}>
                <Text style={styles.createBtnPlus}>+</Text>
                <Text style={styles.createBtnText}>Create</Text>
              </Pressable>
            </View>
          </View>

          {/* Room list */}
          {groups.length > 0 ? (
            <View style={styles.roomList}>
              {groups.map((room) => (
                <Pressable
                  key={room.id}
                  onPress={() => setActiveRoomId(room.id)}
                  style={({ pressed }) => [styles.roomCard, pressed && styles.dimmed]}>
                  <View style={styles.roomCardLeft}>
                    <Text style={styles.roomCardName}>{room.name}</Text>
                    <Text style={styles.roomCardMeta}>
                      1 member · {handsSharedThisWeek(room)} hands this week
                    </Text>
                  </View>
                  <View style={styles.roomCardRight}>
                    <Text style={styles.roomCardActivity}>{lastActivityLabel(room)}</Text>
                    <Text style={styles.roomCardChevron}>›</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>♠</Text>
              <Text style={styles.emptyTitle}>No study groups yet</Text>
              <Text style={styles.emptySub}>
                Create a group, or join one with a code created on this device
              </Text>
              <Pressable
                onPress={() => { setJoinError(''); setShowJoinModal(true); }}
                style={({ pressed }) => [styles.emptyJoinBtn, pressed && styles.dimmed]}>
                <Text style={styles.emptyJoinBtnText}>Join with code</Text>
              </Pressable>
            </View>
          )}

          {/* Join with code shortcut (always visible below the list) */}
          {groups.length > 0 && (
            <Pressable
              onPress={() => { setJoinError(''); setShowJoinModal(true); }}
              style={({ pressed }) => [styles.joinCodeRow, pressed && styles.dimmed]}>
              <Text style={styles.joinCodeRowText}>Join with a code</Text>
              <Text style={styles.joinCodeRowChevron}>›</Text>
            </Pressable>
          )}

          <View style={{ height: BottomTabInset + Spacing.six }} />
        </ScrollView>
      </SafeAreaView>

      {/* Join with code modal */}
      <Modal
        visible={showJoinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowJoinModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowJoinModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <Text style={[styles.sheetTitle, styles.noMargin]}>Join with a code</Text>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetSub}>
            Groups are stored on this device only — codes only work for groups created here.
          </Text>
          <TextInput
            style={styles.codeInput}
            placeholder="e.g. POKER-4821"
            placeholderTextColor={C.textSecondary}
            value={joinCode}
            onChangeText={t => { setJoinCode(t); setJoinError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
          <Pressable
            onPress={handleJoin}
            style={({ pressed }) => [styles.sheetBtn, pressed && styles.dimmed]}>
            <Text style={styles.sheetBtnText}>Join Group</Text>
          </Pressable>
          <View style={{ height: BottomTabInset + Spacing.two }} />
        </View>
      </Modal>

      {/* Create group modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCreateModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <Text style={[styles.sheetTitle, styles.noMargin]}>Create a group</Text>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetSub}>Give your study group a name</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="e.g. Tuesday Night Crew"
            placeholderTextColor={C.textSecondary}
            value={createName}
            onChangeText={setCreateName}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <Pressable
            onPress={handleCreate}
            disabled={!createName.trim()}
            style={({ pressed }) => [styles.sheetBtn, (pressed || !createName.trim()) && styles.dimmed]}>
            <Text style={styles.sheetBtnText}>Create Group</Text>
          </Pressable>
          <View style={{ height: BottomTabInset + Spacing.two }} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.background },
  safe:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three + WebTopClearance },

  // List header
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
  headerButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  joinCodeBtn: {
    borderWidth: 1.5,
    borderColor: C.tint,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  joinCodeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 4,
  },
  createBtnPlus: {
    fontSize: 18,
    fontWeight: '400',
    color: C.tintText,
    lineHeight: 20,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tintText,
  },

  // Room cards
  roomList: { gap: Spacing.two },
  roomCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomCardLeft: { flex: 1, marginRight: Spacing.two },
  roomCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    marginBottom: 4,
  },
  roomCardMeta: {
    fontSize: 13,
    color: C.textSecondary,
  },
  roomCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomCardActivity: {
    fontSize: 12,
    color: C.textSecondary,
  },
  roomCardChevron: {
    fontSize: 22,
    color: C.textSecondary,
    fontWeight: '300',
  },

  // Join with code row
  joinCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.backgroundElement,
  },
  joinCodeRowText: {
    fontSize: 15,
    fontWeight: '500',
    color: C.tint,
  },
  joinCodeRowChevron: {
    fontSize: 20,
    color: C.tint,
    fontWeight: '300',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.four,
  },
  emptyIcon: {
    fontSize: 56,
    color: C.tint,
    marginBottom: Spacing.three,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 15,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.four,
    lineHeight: 22,
  },
  emptyJoinBtn: {
    borderWidth: 1.5,
    borderColor: C.tint,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  emptyJoinBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.tint,
  },

  // Room feed view
  roomHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two + WebTopClearance,
    paddingBottom: Spacing.one,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  backChevron: {
    fontSize: 24,
    color: C.tint,
    fontWeight: '300',
    lineHeight: 26,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: C.tint,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  roomName: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  roomSubtitle: {
    fontSize: 14,
    color: C.textSecondary,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },

  // Feed cards
  feedCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: Spacing.two,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.tintText,
  },
  feedBody: { flex: 1 },
  feedTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  feedMember: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  feedTime: {
    fontSize: 12,
    color: C.textSecondary,
  },
  feedDescription: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
  },
  feedNote: {
    fontSize: 13,
    color: C.text,
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Pinned share button
  addWrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + 44,
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

  // Bottom sheet
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
    maxHeight: '85%',
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
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  noMargin: { marginBottom: 0 },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },
  sheetSub: {
    fontSize: 14,
    color: C.textSecondary,
    marginBottom: Spacing.three,
  },
  codeInput: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontSize: 13,
    color: C.negative,
    marginTop: -8,
    marginBottom: Spacing.two,
  },
  sheetBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sheetBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },

  // Hand picker (share modal)
  handPickerScroll: {
    maxHeight: 220,
    marginBottom: Spacing.three,
  },
  handPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  handPickerRowActive: {
    backgroundColor: C.backgroundElement,
  },
  handPickerText: {
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  handPickerCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tint,
  },

  dimmed: { opacity: 0.7 },
});
