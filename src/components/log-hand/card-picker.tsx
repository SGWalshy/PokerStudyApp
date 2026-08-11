import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { CardType, Rank, Suit, SUITS, SUIT_COLORS } from './types';

const C = Colors.light;

// Row layout: 7 ranks in row 1 (A-8), 6 ranks in row 2 (7-2)
const RANKS_ROW1: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8'];
const RANKS_ROW2: Rank[] = ['7', '6', '5', '4', '3', '2'];

interface CardFaceProps {
  card: CardType | null;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export function CardFace({ card, size = 'md', active = false }: CardFaceProps) {
  const dim = size === 'sm' ? 36 : size === 'md' ? 52 : 68;
  const rankFs = size === 'sm' ? 14 : size === 'md' ? 20 : 26;
  const suitFs = size === 'sm' ? 11 : size === 'md' ? 15 : 20;

  if (!card) {
    return (
      <View style={[styles.emptyCard, { width: dim, height: dim * 1.4, borderRadius: 8 }, active && styles.emptyCardActive]}>
        <Text style={[styles.emptyCardText, { fontSize: rankFs - 4 }]}>?</Text>
      </View>
    );
  }

  const color = SUIT_COLORS[card.suit];
  return (
    <View style={[styles.cardFace, { width: dim, height: dim * 1.4, borderRadius: 8 }]}>
      <Text style={[styles.cardRank, { fontSize: rankFs, color }]}>{card.rank}</Text>
      <Text style={[styles.cardSuit, { fontSize: suitFs, color }]}>{card.suit}</Text>
    </View>
  );
}

interface CardPickerProps {
  cards: (CardType | null)[];
  activeSlot: number;
  onCardPicked: (slot: number, card: CardType) => void;
  onSlotPress: (slot: number) => void;
  onClear?: (slot: number) => void;
  cardSize?: 'sm' | 'md' | 'lg';
  // Disable specific rank+suit combos already in use
  usedCards?: CardType[];
  // Fires once every slot holds a card (after the very last suit tap) so the
  // parent can auto-advance instead of requiring a separate "Continue" tap.
  onAllFilled?: () => void;
  // Mirrors "rank picked, suit not chosen yet" so a parent can warn before
  // letting the user navigate away with a half-finished card.
  onPendingChange?: (rank: Rank | null) => void;
}

export function CardPicker({
  cards,
  activeSlot,
  onCardPicked,
  onSlotPress,
  onClear,
  cardSize = 'lg',
  usedCards = [],
  onAllFilled,
  onPendingChange,
}: CardPickerProps) {
  const [pendingRank, setPendingRankRaw] = useState<Rank | null>(null);
  // One opacity per suit, faded independently — a suit whose card is
  // already used stays dim even while its siblings fade in.
  const suitOpacities = useRef(SUITS.map(() => new Animated.Value(0.35))).current;

  const setPendingRank = (r: Rank | null) => {
    setPendingRankRaw(r);
    onPendingChange?.(r);
  };

  // A card already sitting in one of THIS picker's other slots (e.g. the
  // first flop card while picking the second) is just as unavailable as one
  // used elsewhere in the hand — merge it in here so every caller gets that
  // for free, regardless of what it passes as `usedCards`. The active slot
  // itself is excluded so re-tapping a filled slot to change it doesn't
  // lock out the very card it's currently holding.
  const allUsedCards: CardType[] = [
    ...usedCards,
    ...(cards.filter((c, idx) => idx !== activeSlot && c !== null) as CardType[]),
  ];

  const isCardUsed = (rank: Rank, suit?: Suit): boolean => {
    if (suit) {
      return allUsedCards.some(c => c.rank === rank && c.suit === suit);
    }
    return SUITS.every(s => allUsedCards.some(c => c.rank === rank && c.suit === s));
  };

  const handleRank = (rank: Rank) => {
    setPendingRank(rank === pendingRank ? null : rank);
  };

  // Subtle fade — not a bounce or slide — each suit brightens on its own as
  // soon as a rank makes it a valid pick, and dims back out otherwise.
  useEffect(() => {
    SUITS.forEach((s, i) => {
      const enabled = !!pendingRank && !isCardUsed(pendingRank, s);
      Animated.timing(suitOpacities[i], {
        toValue: enabled ? 1 : 0.35,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
    // usedCards is effectively static during a single picking session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRank]);

  const handleSuit = (suit: Suit) => {
    if (!pendingRank) return;
    if (isCardUsed(pendingRank, suit)) return;
    const rank = pendingRank;
    onCardPicked(activeSlot, { rank, suit });
    setPendingRank(null);
    const updated = cards.map((c, i) => (i === activeSlot ? { rank, suit } : c));
    const nextEmpty = updated.findIndex(c => c === null);
    if (nextEmpty !== -1) onSlotPress(nextEmpty);
    else onAllFilled?.();
  };

  const renderRankRow = (ranks: Rank[]) => (
    <View style={styles.rankRow}>
      {ranks.map((r) => {
        const allUsed = SUITS.every(s => isCardUsed(r, s));
        const isPending = pendingRank === r;
        return (
          <Pressable
            key={r}
            onPress={() => !allUsed && handleRank(r)}
            disabled={allUsed}
            hitSlop={2}
            style={{ flex: 1 }}>
            <View
              style={[
                styles.rankBtn,
                isPending && styles.rankBtnOn,
                allUsed && styles.rankBtnDisabled,
              ]}>
              <Text style={[
                styles.rankText,
                isPending && styles.rankTextOn,
                allUsed && styles.rankTextDisabled,
              ]}>
                {r}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.pickerRoot}>
      {/* Card slots */}
      <View style={styles.slotsRow}>
        {cards.map((card, i) => (
          <Pressable
            key={i}
            onPress={() => onSlotPress(i)}
            onLongPress={() => onClear?.(i)}
            style={[styles.slotWrap, activeSlot === i && styles.slotActive]}>
            <CardFace card={card} size={cardSize} active={activeSlot === i} />
          </Pressable>
        ))}
      </View>
      {onClear && <Text style={styles.clearHint}>Long-press to clear</Text>}

      {/* Rank grid: 7 + 6 layout */}
      {renderRankRow(RANKS_ROW1)}
      {renderRankRow(RANKS_ROW2)}

      {/* Suit row — sits below the ranks at all times; each button fades in
          on its own once it becomes a valid pick for the pending rank. */}
      <View style={styles.suitRow}>
        {SUITS.map((s, i) => {
          const disabled = !pendingRank || isCardUsed(pendingRank, s);
          return (
            <Animated.View key={s} style={[styles.suitBtnWrap, { opacity: suitOpacities[i] }]}>
              <Pressable
                onPress={() => handleSuit(s)}
                disabled={disabled}
                style={({ pressed }) => [styles.suitBtn, pressed && !disabled && styles.suitBtnPressed]}>
                {({ pressed }) => (
                  <Text style={[
                    styles.suitText,
                    { color: SUIT_COLORS[s] },
                    pressed && !disabled && styles.suitTextPressed,
                  ]}>
                    {s}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <Text style={[styles.instructions, pendingRank && styles.instructionsActive]}>
        {pendingRank ? `Now tap a suit for ${pendingRank} ↑` : 'Tap a rank to start'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerRoot: { gap: 12 },

  slotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  slotWrap: { padding: 3, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  slotActive: { borderColor: C.tint },

  emptyCard: {
    backgroundColor: C.backgroundElement,
    borderWidth: 1.5,
    borderColor: C.backgroundSelected,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardActive: { borderColor: C.tint, backgroundColor: 'rgba(27,67,50,0.06)' },
  emptyCardText: { color: C.textSecondary, fontWeight: '600' },

  cardFace: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: C.backgroundSelected,
  },
  cardRank: { fontWeight: '800' },
  cardSuit: { fontWeight: '600' },

  // Every rank/suit button is a clearly outlined box, same language as the
  // rest of the app — cream + dark outline unselected, filled green + cream
  // text selected. No shadows or glows.
  rankRow: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  rankBtn: {
    minWidth: 44,
    height: 46,
    borderRadius: 10,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.text,
  },
  rankBtnOn: {
    backgroundColor: C.tint,
    borderColor: C.tint,
  },
  rankBtnDisabled: { backgroundColor: C.backgroundSelected, borderColor: C.backgroundSelected, opacity: 0.5 },
  rankText: { fontSize: 17, fontWeight: '700', color: C.text },
  rankTextOn: { color: C.background },
  rankTextDisabled: { color: C.textSecondary },

  suitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  suitBtnWrap: { flex: 1, maxWidth: 76 },
  suitBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.text,
  },
  suitBtnPressed: {
    backgroundColor: C.tint,
    borderColor: C.tint,
  },
  suitText: { fontSize: 26, fontWeight: '700' },
  suitTextPressed: { color: C.background },

  instructions: { textAlign: 'center', fontSize: 13, color: C.textSecondary },
  instructionsActive: { color: C.tint, fontWeight: '700' },
  clearHint: { textAlign: 'center', fontSize: 11, color: C.textSecondary, marginTop: -6 },
});
