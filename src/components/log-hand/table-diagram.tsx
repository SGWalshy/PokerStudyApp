import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { POSITION_LABELS } from './types';

const C = Colors.light;

const W = 300;
const H = 180;
const SEAT = 24; // seat circle radius
const CX = W / 2;
const CY = H / 2;
const RX = W / 2 - SEAT - 6;
const RY = H / 2 - SEAT - 4;

function seatPos(i: number, n: number) {
  // Seat 0 at bottom-center, going clockwise
  const angle = Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
}

interface Props {
  playerCount: number;
  heroSeat: number | null;
  villainSeats: number[];
  onSeatPress: (i: number) => void;
}

export function TableDiagram({ playerCount, heroSeat, villainSeats, onSeatPress }: Props) {
  const labels = POSITION_LABELS[playerCount] ?? [];

  return (
    <View>
      <View style={{ width: W, height: H, alignSelf: 'center', position: 'relative' }}>
        {/* Felt oval */}
        <View style={styles.felt}>
          <Text style={styles.feltLabel}>POKER</Text>
        </View>

        {/* Seats */}
        {Array.from({ length: playerCount }).map((_, i) => {
          const { x, y } = seatPos(i, playerCount);
          const isHero    = heroSeat === i;
          const isVillain = villainSeats.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => onSeatPress(i)}
              style={[
                styles.seat,
                { left: x - SEAT, top: y - SEAT },
                isHero    && styles.seatHero,
                isVillain && styles.seatVillain,
              ]}>
              <Text
                style={[
                  styles.seatText,
                  (isHero || isVillain) && styles.seatTextActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {labels[i] ?? String(i + 1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: C.tint }]} />
          <Text style={styles.legendText}>You</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#C04040' }]} />
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
    backgroundColor: '#1B4332',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#163828',
  },
  feltLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(212,237,218,0.25)',
    letterSpacing: 4,
  },
  seat: {
    position: 'absolute',
    width: SEAT * 2,
    height: SEAT * 2,
    borderRadius: SEAT,
    backgroundColor: C.backgroundElement,
    borderWidth: 2,
    borderColor: C.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatHero:    { backgroundColor: C.tint,    borderColor: '#143828' },
  seatVillain: { backgroundColor: '#C04040', borderColor: '#8B2020' },
  seatText: {
    fontSize: 8,
    fontWeight: '700',
    color: C.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 1,
  },
  seatTextActive: { color: '#fff' },

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
});
