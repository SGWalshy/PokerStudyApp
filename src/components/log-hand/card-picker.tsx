import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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

  const setPendingRank = (r: Rank | null) => {
    setPendingRankRaw(r);
    onPendingChange?.(r);
  };

  const isCardUsed = (rank: Rank, suit?: Suit): boolean => {
    if (suit) {
      return usedCards.some(c => c.rank === rank && c.suit === suit);
    }
    return usedCards.every(c => c.rank === rank); // all 4 suits used
  };

  const handleRank = (rank: Rank) => {
    setPendingRank(rank === pendingRank ? null : rank);
  };

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

      {/* Suit row — sits below the ranks at all times; simply brightens once
          a rank is pending, with no size change or bounce. */}
      <View style={[styles.suitRow, pendingRank && styles.suitRowActive]}>
        {SUITS.map((s) => {
          const disabled = !pendingRank || isCardUsed(pendingRank, s);
          return (
            <Pressable
              key={s}
              onPress={() => handleSuit(s)}
              disabled={disabled}
              style={[styles.suitBtn, !!pendingRank && styles.suitBtnActive, disabled && styles.suitBtnOff]}>
              <Text style={[
                styles.suitText,
                { color: SUIT_COLORS[s] },
                disabled && styles.suitTextOff,
              ]}>
                {s}
              </Text>
            </Pressable>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  cardRank: { fontWeight: '800' },
  cardSuit: { fontWeight: '600' },

  rankRow: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  rankBtn: {
    minWidth: 44,
    height: 46,
    borderRadius: 10,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBtnOn: {
    backgroundColor: C.tint,
  },
  rankBtnDisabled: { backgroundColor: C.backgroundSelected, opacity: 0.4 },
  rankText: { fontSize: 17, fontWeight: '700', color: C.text },
  rankTextOn: { color: C.tintText },
  rankTextDisabled: { color: C.textSecondary },

  suitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  suitBtn: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 76,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  suitRowActive: {},
  suitBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: C.tint,
    opacity: 1,
  },
  suitBtnOff: { opacity: 0.3 },
  suitText: { fontSize: 26, fontWeight: '600' },
  suitTextOff: {},

  instructions: { textAlign: 'center', fontSize: 13, color: C.textSecondary },
  instructionsActive: { color: C.tint, fontWeight: '700' },
  clearHint: { textAlign: 'center', fontSize: 11, color: C.textSecondary, marginTop: -6 },
});
