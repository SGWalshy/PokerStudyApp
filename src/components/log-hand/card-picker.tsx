import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { CardType, Rank, RANKS, Suit, SUITS, SUIT_COLORS } from './types';

const C = Colors.light;

// ── Single card face ─────────────────────────────────────────────────────────

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
      <View
        style={[
          styles.emptyCard,
          { width: dim, height: dim * 1.4, borderRadius: 8 },
          active && styles.emptyCardActive,
        ]}>
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

// ── Card picker (rank → suit selection) ──────────────────────────────────────

interface CardPickerProps {
  cards: (CardType | null)[];
  activeSlot: number;
  onCardPicked: (slot: number, card: CardType) => void;
  onSlotPress: (slot: number) => void;
  onClear?: (slot: number) => void;
  cardSize?: 'sm' | 'md' | 'lg';
}

export function CardPicker({
  cards,
  activeSlot,
  onCardPicked,
  onSlotPress,
  onClear,
  cardSize = 'lg',
}: CardPickerProps) {
  const [pendingRank, setPendingRank] = useState<Rank | null>(null);

  const handleRank = (rank: Rank) => {
    setPendingRank(rank === pendingRank ? null : rank);
  };

  const handleSuit = (suit: Suit) => {
    if (!pendingRank) return;
    onCardPicked(activeSlot, { rank: pendingRank, suit });
    setPendingRank(null);
    // auto-advance slot
    const nextEmpty = cards.findIndex((c, i) => i !== activeSlot && c === null);
    if (nextEmpty !== -1) onSlotPress(nextEmpty);
  };

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
      {onClear && (
        <Text style={styles.clearHint}>Long-press a card to clear it</Text>
      )}

      {/* Rank grid */}
      <View style={styles.rankGrid}>
        {RANKS.map((r) => (
          <Pressable
            key={r}
            onPress={() => handleRank(r)}
            style={[styles.rankBtn, pendingRank === r && styles.rankBtnOn]}>
            <Text style={[styles.rankText, pendingRank === r && styles.rankTextOn]}>
              {r}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Suit row */}
      <View style={styles.suitRow}>
        {SUITS.map((s) => (
          <Pressable
            key={s}
            onPress={() => handleSuit(s)}
            disabled={!pendingRank}
            style={[styles.suitBtn, !pendingRank && styles.suitBtnOff]}>
            <Text style={[styles.suitText, { color: SUIT_COLORS[s] }, !pendingRank && styles.suitTextOff]}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.instructions}>
        {pendingRank ? `Select a suit for ${pendingRank}` : 'Select a rank first'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerRoot: { gap: 14 },

  slotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  slotWrap: {
    padding: 3,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotActive: {
    borderColor: C.tint,
  },

  emptyCard: {
    backgroundColor: C.backgroundElement,
    borderWidth: 1.5,
    borderColor: C.backgroundSelected,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardActive: {
    borderColor: C.tint,
    backgroundColor: 'rgba(27,67,50,0.06)',
  },
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

  rankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'center',
  },
  rankBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBtnOn: { backgroundColor: C.tint },
  rankText: { fontSize: 18, fontWeight: '700', color: C.text },
  rankTextOn: { color: C.tintText },

  suitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  suitBtn: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 72,
  },
  suitBtnOff: { opacity: 0.35 },
  suitText: { fontSize: 26, fontWeight: '600' },
  suitTextOff: {},

  instructions: {
    textAlign: 'center',
    fontSize: 13,
    color: C.textSecondary,
  },
  clearHint: {
    textAlign: 'center',
    fontSize: 11,
    color: C.textSecondary,
    marginTop: -8,
  },
});
