import { useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Colors, Spacing } from '@/constants/theme';
import { CurrencyCode, formatMoney, formatMoneyCompact } from '@/utils/currency';
import { BankrollHistoryPoint } from '@/utils/stats';

const C = Colors.light;

const CHART_HEIGHT = 140;
const DOT_RADIUS = 4;
const TOP_PAD = 12;
const BOTTOM_PAD = 12;
const Y_AXIS_WIDTH = 52;

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All Time' },
];

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

// Marks the synthetic start/end anchor points added so the line always
// spans the full width, even when a period has zero or one real entries.
const SYNTHETIC_PREFIX = '__synthetic__';

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function shortDateWithYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Builds a series that always spans [start, end]: a synthetic anchor at
// `start` carrying forward whatever the bankroll was before this window,
// every real entry that falls inside the window, and a synthetic anchor at
// `end` carrying the last known value forward to "now". When there are no
// real entries in range, the two anchors share the same value, so the line
// is simply flat across the whole chart instead of the chart disappearing.
function buildPlotSeries(points: BankrollHistoryPoint[], start: number, end: number): BankrollHistoryPoint[] {
  const inRange = points.filter(p => {
    const t = new Date(p.date).getTime();
    return t >= start && t <= end;
  });

  const before = points.filter(p => new Date(p.date).getTime() < start);
  const baseline = before.length > 0
    ? before[before.length - 1].runningTotal
    : inRange.length > 0
      ? inRange[0].runningTotal - inRange[0].result
      : points.length > 0
        ? points[0].runningTotal - points[0].result
        : 0;

  const lastValue = inRange.length > 0 ? inRange[inRange.length - 1].runningTotal : baseline;

  return [
    { id: `${SYNTHETIC_PREFIX}start`, date: new Date(start).toISOString(), runningTotal: baseline, result: 0 },
    ...inRange,
    { id: `${SYNTHETIC_PREFIX}end`, date: new Date(end).toISOString(), runningTotal: lastValue, result: 0 },
  ];
}

function getPeriodBounds(period: Period, points: BankrollHistoryPoint[]): { start: number; end: number } {
  const end = Date.now();
  if (period === 'all') {
    if (points.length === 0) return { start: end - 86400000, end };
    const earliest = new Date(points[0].date).getTime();
    return { start: Math.min(earliest, end - 86400000), end };
  }
  return { start: end - PERIOD_DAYS[period] * 86400000, end };
}

export function BankrollHistoryChart({ points, currency }: { points: BankrollHistoryPoint[]; currency: CurrencyCode }) {
  const [plotWidth, setPlotWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>('month');

  function onLayout(e: LayoutChangeEvent) {
    setPlotWidth(e.nativeEvent.layout.width);
  }

  const { start, end } = useMemo(() => getPeriodBounds(period, points), [period, points]);
  const series = useMemo(() => buildPlotSeries(points, start, end), [points, start, end]);

  const PeriodTabs = (
    <View style={styles.periodRow}>
      {PERIOD_OPTIONS.map(opt => (
        <Pressable
          key={opt.key}
          onPress={() => { setPeriod(opt.key); setSelected(null); }}
          style={[styles.periodBadge, period === opt.key && styles.periodBadgeActive]}>
          <Text style={[styles.periodText, period === opt.key && styles.periodTextActive]} numberOfLines={1}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const totals = series.map(p => p.runningTotal);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const range = max - min || 1;

  const tRange = end - start || 1;
  const plotHeight = CHART_HEIGHT - TOP_PAD - BOTTOM_PAD;

  const coords = series.map((p) => ({
    x: ((new Date(p.date).getTime() - start) / tRange) * plotWidth,
    y: TOP_PAD + plotHeight - ((p.runningTotal - min) / range) * plotHeight,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${CHART_HEIGHT - BOTTOM_PAD} L ${coords[0].x} ${CHART_HEIGHT - BOTTOM_PAD} Z`;

  const selectedPoint = selected !== null ? series[selected] : null;
  const selectedCoord = selected !== null ? coords[selected] : null;

  let tooltipLeft = 0;
  if (selectedCoord && plotWidth > 0) {
    tooltipLeft = Math.max(4, Math.min(plotWidth - 144, selectedCoord.x - 72));
  }

  // Tap detection lives in a plain Pressable overlay rather than per-dot SVG
  // onPress handlers — react-native-svg's own touch dispatch can end up
  // claiming the gesture before the parent ScrollView gets a chance to
  // recognize a drag as a scroll, which silently blocks scrolling on native
  // (a difference that doesn't show up when testing on web, since web
  // scrolling is plain browser overflow, not RN's gesture responder system).
  function handleChartPress(e: GestureResponderEvent) {
    // On native, GestureResponderEvent always carries locationX. On web,
    // react-native-web's Pressable passes the raw DOM MouseEvent through as
    // nativeEvent, which has no locationX — offsetX (position relative to
    // the target element) is the web equivalent.
    const x = e.nativeEvent.locationX ?? (e.nativeEvent as unknown as { offsetX: number }).offsetX;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      if (series[i].id.startsWith(SYNTHETIC_PREFIX)) return;
      const dist = Math.abs(c.x - x);
      if (dist < nearestDist) { nearestDist = dist; nearest = i; }
    });
    if (nearestDist === Infinity) return;
    setSelected(prev => (prev === nearest ? null : nearest));
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Bankroll History</Text>
      {PeriodTabs}

      <View style={styles.chartRow}>
        {/* Y axis — dollar values */}
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{formatMoneyCompact(max, currency)}</Text>
          <Text style={styles.axisLabel}>{formatMoneyCompact(min, currency)}</Text>
        </View>

        <View style={styles.chartWrap} onLayout={onLayout}>
          {plotWidth > 0 && (
            <Svg width={plotWidth} height={CHART_HEIGHT}>
              <Path d={areaPath} fill="rgba(27,67,50,0.10)" />
              {coords.slice(1).map((c, i) => {
                const prev = coords[i];
                const rising = series[i + 1].runningTotal >= series[i].runningTotal;
                return (
                  <Line
                    key={i}
                    x1={prev.x} y1={prev.y}
                    x2={c.x} y2={c.y}
                    stroke={rising ? C.tint : C.negative}
                    strokeWidth={2.5}
                  />
                );
              })}
              {coords.map((c, i) => {
                if (series[i].id.startsWith(SYNTHETIC_PREFIX)) return null;
                const rising = i === 0 || series[i].runningTotal >= series[i - 1].runningTotal;
                return (
                  <Circle
                    key={i}
                    cx={c.x} cy={c.y} r={selected === i ? DOT_RADIUS + 2 : DOT_RADIUS}
                    fill={rising ? C.tint : C.negative}
                    stroke={C.background}
                    strokeWidth={1.5}
                  />
                );
              })}
            </Svg>
          )}

          {plotWidth > 0 && <Pressable style={StyleSheet.absoluteFill} onPress={handleChartPress} />}

          {selectedPoint && selectedCoord && (
            <Pressable style={[styles.tooltip, { left: tooltipLeft }]} onPress={() => setSelected(null)}>
              <Text style={styles.tooltipDate}>{shortDate(selectedPoint.date)}</Text>
              <Text style={[styles.tooltipResult, selectedPoint.result < 0 && styles.negative]}>
                {selectedPoint.result >= 0 ? '+' : '-'}{formatMoney(Math.abs(selectedPoint.result), currency)}
              </Text>
              <Text style={styles.tooltipTotal}>
                Total: {selectedPoint.runningTotal < 0 ? '-' : ''}{formatMoney(Math.abs(selectedPoint.runningTotal), currency)}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* X axis — time range */}
      <View style={[styles.axisRow, { marginLeft: Y_AXIS_WIDTH }]}>
        <Text style={styles.axisLabel}>{shortDateWithYear(new Date(start).toISOString())}</Text>
        <Text style={styles.axisLabel}>{shortDateWithYear(new Date(end).toISOString())}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },

  // Period selector
  periodRow: {
    flexDirection: 'row',
    backgroundColor: C.backgroundSelected,
    borderRadius: 10,
    padding: 3,
    marginBottom: Spacing.three,
    gap: 3,
  },
  periodBadge: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  periodBadgeActive: { backgroundColor: C.tint },
  periodText: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
  periodTextActive: { color: C.tintText },

  chartRow: {
    flexDirection: 'row',
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
    paddingVertical: TOP_PAD - 4,
  },
  chartWrap: {
    flex: 1,
    height: CHART_HEIGHT,
    position: 'relative',
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    width: 144,
    backgroundColor: C.text,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tooltipDate: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  tooltipResult: {
    fontSize: 14,
    fontWeight: '700',
    color: C.positiveOnDark,
  },
  tooltipTotal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
  },
  negative: { color: C.negativeOnDark },

  // Axis labels
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisLabel: {
    fontSize: 10,
    color: C.textSecondary,
    fontWeight: '500',
  },
});
