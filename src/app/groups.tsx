import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

interface RoomHand {
  id: string;
  member: string;
  description: string;
  timeAgo: string;
}

interface Room {
  id: string;
  name: string;
  members: number;
  handsThisWeek: number;
  lastActivity: string;
  hands: RoomHand[];
}

const ROOMS: Room[] = [
  {
    id: '1',
    name: 'Tuesday Night Crew',
    members: 4,
    handsThisWeek: 12,
    lastActivity: '2h ago',
    hands: [
      { id: 'h1', member: 'Alex',  description: 'BTN vs BB — AKs, 3-Bet pot, River',   timeAgo: '2h ago'  },
      { id: 'h2', member: 'Sarah', description: 'CO vs BTN — JJ, SRP, Turn shove',       timeAgo: '4h ago'  },
      { id: 'h3', member: 'Mike',  description: 'UTG vs BB — QQ, 4-Bet pot, Preflop',    timeAgo: '6h ago'  },
      { id: 'h4', member: 'Alex',  description: 'SB vs BB — 87s, SRP, Flop check-raise', timeAgo: 'Yesterday' },
      { id: 'h5', member: 'Sarah', description: 'HJ vs CO — KQo, SRP, River bluff',      timeAgo: 'Yesterday' },
    ],
  },
  {
    id: '2',
    name: 'Coach John',
    members: 2,
    handsThisWeek: 5,
    lastActivity: '1d ago',
    hands: [
      { id: 'h6', member: 'John',  description: 'BTN vs SB — TT, 3-Bet pot, Flop',       timeAgo: '1d ago' },
      { id: 'h7', member: 'You',   description: 'BB vs UTG — A5s, SRP, Turn probe',       timeAgo: '1d ago' },
      { id: 'h8', member: 'John',  description: 'CO vs BB — KK, 3-Bet pot, River thin value', timeAgo: '2d ago' },
    ],
  },
];

const MEMBER_COLOURS: Record<string, string> = {
  Alex:  '#3A7BD5',
  Sarah: '#9B59B6',
  Mike:  '#E67E22',
  John:  '#1B4332',
  You:   '#2E7D52',
};

function avatarColor(name: string) {
  return MEMBER_COLOURS[name] ?? '#9A9080';
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function GroupsScreen() {
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [showJoinModal, setShowJoinModal]   = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinCode, setJoinCode]             = useState('');

  // ── Room feed view ──────────────────────────────────────────────────────────
  if (activeRoom) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* Room header */}
          <View style={styles.roomHeader}>
            <Pressable
              onPress={() => setActiveRoom(null)}
              style={({ pressed }) => [styles.backBtn, pressed && styles.dimmed]}>
              <Text style={styles.backChevron}>‹</Text>
              <Text style={styles.backLabel}>Groups</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}>

            <Text style={styles.roomName}>{activeRoom.name}</Text>
            <Text style={styles.roomSubtitle}>
              {activeRoom.members} members · {activeRoom.handsThisWeek} hands this week
            </Text>

            <Text style={[styles.sectionTitle, { marginTop: Spacing.three }]}>Hand Feed</Text>

            {activeRoom.hands.map((hand) => (
              <Pressable
                key={hand.id}
                style={({ pressed }) => [styles.feedCard, pressed && styles.dimmed]}>
                <View style={[styles.avatar, { backgroundColor: avatarColor(hand.member) }]}>
                  <Text style={styles.avatarText}>{initials(hand.member)}</Text>
                </View>
                <View style={styles.feedBody}>
                  <View style={styles.feedTopRow}>
                    <Text style={styles.feedMember}>{hand.member}</Text>
                    <Text style={styles.feedTime}>{hand.timeAgo}</Text>
                  </View>
                  <Text style={styles.feedDescription}>{hand.description}</Text>
                </View>
              </Pressable>
            ))}

            <View style={{ height: BottomTabInset + Spacing.three }} />
          </ScrollView>
        </SafeAreaView>
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
                onPress={() => setShowJoinModal(true)}
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
          {ROOMS.length > 0 ? (
            <View style={styles.roomList}>
              {ROOMS.map((room) => (
                <Pressable
                  key={room.id}
                  onPress={() => setActiveRoom(room)}
                  style={({ pressed }) => [styles.roomCard, pressed && styles.dimmed]}>
                  <View style={styles.roomCardLeft}>
                    <Text style={styles.roomCardName}>{room.name}</Text>
                    <Text style={styles.roomCardMeta}>
                      {room.members} members · {room.handsThisWeek} hands this week
                    </Text>
                  </View>
                  <View style={styles.roomCardRight}>
                    <Text style={styles.roomCardActivity}>{room.lastActivity}</Text>
                    <Text style={styles.roomCardChevron}>›</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>♟</Text>
              <Text style={styles.emptyTitle}>No study groups yet</Text>
              <Text style={styles.emptySub}>
                Create a group or join one with a code
              </Text>
              <Pressable
                onPress={() => setShowJoinModal(true)}
                style={({ pressed }) => [styles.emptyJoinBtn, pressed && styles.dimmed]}>
                <Text style={styles.emptyJoinBtnText}>Join with code</Text>
              </Pressable>
            </View>
          )}

          {/* Join with code shortcut (always visible below the list) */}
          {ROOMS.length > 0 && (
            <Pressable
              onPress={() => setShowJoinModal(true)}
              style={({ pressed }) => [styles.joinCodeRow, pressed && styles.dimmed]}>
              <Text style={styles.joinCodeRowText}>Join with a code</Text>
              <Text style={styles.joinCodeRowChevron}>›</Text>
            </Pressable>
          )}

          <View style={{ height: BottomTabInset + Spacing.three }} />
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
          <Text style={styles.sheetTitle}>Join with a code</Text>
          <Text style={styles.sheetSub}>Enter the invite code shared by your group</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="e.g. POKER-4821"
            placeholderTextColor={C.textSecondary}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => setShowJoinModal(false)}
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
          <Text style={styles.sheetTitle}>Create a group</Text>
          <Text style={styles.sheetSub}>Give your study group a name</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="e.g. Tuesday Night Crew"
            placeholderTextColor={C.textSecondary}
            autoCorrect={false}
          />
          <Pressable
            onPress={() => setShowCreateModal(false)}
            style={({ pressed }) => [styles.sheetBtn, pressed && styles.dimmed]}>
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
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },

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
    fontSize: 48,
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
    paddingTop: Spacing.two,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
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

  dimmed: { opacity: 0.7 },
});
