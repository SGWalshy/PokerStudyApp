import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { POSITION_LABELS } from './types';

const C = Colors.light;

const W = 300;
const H = 180;
const SEAT = 24;
const CX = W / 2;
const CY = H / 2;
const RX = W / 2 - SEAT - 6;
const RY = H / 2 - SEAT - 4;

// Villain color progression: first = solid red, second = orange-red, third = amber-red
const VILLAIN_COLORS = ['#C04040', '#D4683A', '#C8942A'];
const VILLAIN_BORDER  = ['#8B2020', '#A04020', '#9A6C10'];

function seatPos(i: number, n: number) {
  const angle = Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
}

const HIGHLIGHT_BORDER = '#C8940A'; // amber — "tap to select" hint
const DEFAULT_BORDER   = '#9A9080'; // darker than fill so outline is visible

interface Props {
  playerCount: number;
  heroSeat: number | null;
  villainSeats: number[];
  onSeatPress: (i: number) => void;
  highlightEmptySeats?: boolean; // when true, empty seats show a ring
  highlightColor?: string; // ring color — matches the actor currently being selected
}

export function TableDiagram({ playerCount, heroSeat, villainSeats, onSeatPress, highlightEmptySeats, highlightColor }: Props) {
  const labels = POSITION_LABELS[playerCount] ?? [];

  return (
    <View>
      <View style={{ width: W, height: H, alignSelf: 'center', position: 'relative' }}>
        {/* Felt */}
        <View style={styles.felt} />

        {/* Seats */}
        {Array.from({ length: playerCount }).map((_, i) => {
          const { x, y } = seatPos(i, playerCount);
          const isHero = heroSeat === i;
          const villainIdx = villainSeats.indexOf(i);
          const isVillain = villainIdx !== -1;
          const isEmpty = !isHero && !isVillain;

          const bgColor = isHero
            ? C.tint
            : isVillain
            ? VILLAIN_COLORS[villainIdx] ?? VILLAIN_COLORS[2]
            : C.backgroundElement;

          const borderColor = isHero
            ? '#143828'
            : isVillain
            ? VILLAIN_BORDER[villainIdx] ?? VILLAIN_BORDER[2]
            : highlightEmptySeats
            ? (highlightColor ?? HIGHLIGHT_BORDER)
            : DEFAULT_BORDER;

          const borderWidth = isEmpty && highlightEmptySeats ? 2.5 : 2;

          const label = labels[i] ?? String(i + 1);
          const villainLabel = isVillain ? `V${villainIdx + 1}` : null;

          return (
            <Pressable
              key={i}
              onPress={() => onSeatPress(i)}
              style={[
                styles.seat,
                { left: x - SEAT, top: y - SEAT, backgroundColor: bgColor, borderColor, borderWidth },
              ]}>
              <Text
                style={[styles.seatText, (isHero || isVillain) && styles.seatTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {label}
              </Text>
              {villainLabel && (
                <Text style={styles.villainLabel}>{villainLabel}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: C.tint, borderWidth: 2, borderColor: '#143828' }]} />
          <Text style={styles.legendText}>Hero</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: VILLAIN_COLORS[0] }]} />
          <Text style={styles.legendText}>Villain</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: C.backgroundSelected }]} />
          <Text style={styles.legendText}>Empty</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  felt: {
    position: 'absolute',
    top: SEAT,
    left: SEAT,
    right: SEAT,
    bottom: SEAT,
    backgroundColor: '#1A2036',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#131828',
  },
  seat: {
    position: 'absolute',
    width: SEAT * 2,
    height: SEAT * 2,
    borderRadius: SEAT,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatText: {
    fontSize: 8,
    fontWeight: '700',
    color: C.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 1,
  },
  seatTextActive: { color: '#fff' },
  villainLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginTop: -1,
  },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
});
