import { useEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PADDING_ROWS = Math.floor(VISIBLE_ROWS / 2);

interface DatePickerModalProps {
  visible: boolean;
  value: string; // 'YYYY-MM-DD'
  onClose: () => void;
  onSelect: (date: string) => void;
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date();
}

function formatISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// "Monday 25 June 2026"
export function formatDateReadable(value: string): string {
  const d = parseDate(value);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday} ${d.getDate()} ${month} ${d.getFullYear()}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

// Monday-first grid offset for the 1st of the month.
function firstWeekdayOffset(y: number, m: number): number {
  const dow = new Date(y, m, 1).getDay(); // 0=Sun..6=Sat
  return dow === 0 ? 6 : dow - 1;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// Renders as an inline overlay (not its own <Modal>) so it can be dropped
// into a sheet that's already inside a <Modal> — stacking a second native
// Modal on top of the first is unreliable on real iOS/Android devices, even
// though it works fine on web.
export function DatePickerModal({ visible, value, onClose, onSelect }: DatePickerModalProps) {
  const [pending, setPending] = useState<Date>(() => parseDate(value));

  const YEARS = useMemo(() => {
    const nowYear = new Date().getFullYear();
    return Array.from({ length: 9 }, (_, i) => nowYear - 6 + i);
  }, []);

  const dayScrollRef = useRef<ScrollView>(null);
  const monthScrollRef = useRef<ScrollView>(null);
  const yearScrollRef = useRef<ScrollView>(null);

  function scrollWheelsTo(d: Date) {
    requestAnimationFrame(() => {
      dayScrollRef.current?.scrollTo({ y: (d.getDate() - 1) * ITEM_HEIGHT, animated: false });
      monthScrollRef.current?.scrollTo({ y: d.getMonth() * ITEM_HEIGHT, animated: false });
      const yIdx = clamp(YEARS.indexOf(d.getFullYear()), 0, YEARS.length - 1);
      yearScrollRef.current?.scrollTo({ y: yIdx * ITEM_HEIGHT, animated: false });
    });
  }

  // Re-seed whenever the picker is opened, so it always starts on the field's current date.
  useEffect(() => {
    if (!visible) return;
    const d = parseDate(value);
    setPending(d);
    scrollWheelsTo(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  // Keep the parent's value continuously in sync with whatever is currently
  // selected — not just on explicit Confirm. That way, if the sheet gets
  // dismissed some other way (e.g. tapping outside, since this picker is an
  // overlay inside a bottom sheet that doesn't cover the full screen), the
  // date the user landed on is already saved rather than lost.
  useEffect(() => {
    if (!visible) return;
    onSelect(formatISO(pending));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pending]);

  const maxDay = daysInMonth(pending.getFullYear(), pending.getMonth());

  function handleDayScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT), 0, maxDay - 1);
    setPending(prev => new Date(prev.getFullYear(), prev.getMonth(), idx + 1));
  }

  function handleMonthScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT), 0, 11);
    setPending(prev => {
      const newMax = daysInMonth(prev.getFullYear(), idx);
      const day = Math.min(prev.getDate(), newMax);
      if (day !== prev.getDate()) {
        requestAnimationFrame(() => dayScrollRef.current?.scrollTo({ y: (day - 1) * ITEM_HEIGHT, animated: false }));
      }
      return new Date(prev.getFullYear(), idx, day);
    });
  }

  function handleYearScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT), 0, YEARS.length - 1);
    setPending(prev => {
      const year = YEARS[idx];
      const newMax = daysInMonth(year, prev.getMonth());
      const day = Math.min(prev.getDate(), newMax);
      if (day !== prev.getDate()) {
        requestAnimationFrame(() => dayScrollRef.current?.scrollTo({ y: (day - 1) * ITEM_HEIGHT, animated: false }));
      }
      return new Date(year, prev.getMonth(), day);
    });
  }

  function selectCalendarDay(day: number) {
    setPending(prev => new Date(prev.getFullYear(), prev.getMonth(), day));
    requestAnimationFrame(() => dayScrollRef.current?.scrollTo({ y: (day - 1) * ITEM_HEIGHT, animated: false }));
  }

  function goPrevMonth() {
    setPending(prev => {
      let month = prev.getMonth() - 1;
      let year = prev.getFullYear();
      if (month < 0) { month = 11; year -= 1; }
      const day = Math.min(prev.getDate(), daysInMonth(year, month));
      const next = new Date(year, month, day);
      scrollWheelsTo(next);
      return next;
    });
  }

  function goNextMonth() {
    setPending(prev => {
      let month = prev.getMonth() + 1;
      let year = prev.getFullYear();
      if (month > 11) { month = 0; year += 1; }
      const day = Math.min(prev.getDate(), daysInMonth(year, month));
      const next = new Date(year, month, day);
      scrollWheelsTo(next);
      return next;
    });
  }

  const today = new Date();
  const isCurrentMonthToday = today.getFullYear() === pending.getFullYear() && today.getMonth() === pending.getMonth();

  const calendarCells = useMemo(() => {
    const offset = firstWeekdayOffset(pending.getFullYear(), pending.getMonth());
    const total = daysInMonth(pending.getFullYear(), pending.getMonth());
    return Array.from({ length: offset + total }, (_, i) => (i < offset ? null : i - offset + 1));
  }, [pending]);

  function confirm() {
    onSelect(formatISO(pending));
    onClose();
  }

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Select Date</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.selectedText}>{formatDateReadable(formatISO(pending))}</Text>

      {/* Scroll wheels — day, month, year */}
      <View style={styles.wheelWrap}>
        <View pointerEvents="none" style={styles.wheelHighlight} />
        <ScrollView
          ref={dayScrollRef}
          style={styles.wheelColumn}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={handleDayScroll}
          contentContainerStyle={{ paddingVertical: PADDING_ROWS * ITEM_HEIGHT }}>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d, i) => (
            <View key={d} style={styles.wheelItem}>
              <Text style={[styles.wheelItemText, i === pending.getDate() - 1 && styles.wheelItemTextActive]}>{d}</Text>
            </View>
          ))}
        </ScrollView>
        <ScrollView
          ref={monthScrollRef}
          style={styles.wheelColumn}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={handleMonthScroll}
          contentContainerStyle={{ paddingVertical: PADDING_ROWS * ITEM_HEIGHT }}>
          {MONTH_SHORT.map((m, i) => (
            <View key={m} style={styles.wheelItem}>
              <Text style={[styles.wheelItemText, i === pending.getMonth() && styles.wheelItemTextActive]}>{m}</Text>
            </View>
          ))}
        </ScrollView>
        <ScrollView
          ref={yearScrollRef}
          style={styles.wheelColumn}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={handleYearScroll}
          contentContainerStyle={{ paddingVertical: PADDING_ROWS * ITEM_HEIGHT }}>
          {YEARS.map((y, i) => (
            <View key={y} style={styles.wheelItem}>
              <Text style={[styles.wheelItemText, y === pending.getFullYear() && styles.wheelItemTextActive]}>{y}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Calendar — same date, always visible below the wheels */}
      <View style={styles.calHeader}>
        <Pressable onPress={goPrevMonth} style={styles.calNavBtn} hitSlop={8}>
          <Text style={styles.calNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calHeaderText}>{MONTH_NAMES[pending.getMonth()]} {pending.getFullYear()}</Text>
        <Pressable onPress={goNextMonth} style={styles.calNavBtn} hitSlop={8}>
          <Text style={styles.calNavText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w, i) => (
          <Text key={i} style={styles.weekdayText}>{w}</Text>
        ))}
      </View>

      <View style={styles.calGrid}>
        {calendarCells.map((day, i) => {
          if (day === null) return <View key={i} style={styles.calCell} />;
          const isSelected = day === pending.getDate();
          const isToday = isCurrentMonthToday && day === today.getDate();
          return (
            <Pressable
              key={i}
              onPress={() => selectCalendarDay(day)}
              style={[styles.calCell, isSelected && styles.calCellSelected, isToday && !isSelected && styles.calCellToday]}>
              <Text style={[styles.calCellText, isSelected && styles.calCellTextSelected]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={confirm} style={({ pressed }) => [styles.confirmBtn, pressed && styles.dimmed]}>
        <Text style={styles.confirmBtnText}>Confirm Date</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 10,
    elevation: 10,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSecondary,
  },
  selectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
    marginBottom: Spacing.three,
  },

  // Wheel
  wheelWrap: {
    flexDirection: 'row',
    height: WHEEL_HEIGHT,
    position: 'relative',
    marginBottom: Spacing.three,
  },
  wheelHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PADDING_ROWS * ITEM_HEIGHT,
    height: ITEM_HEIGHT,
    backgroundColor: C.backgroundSelected,
    borderRadius: 10,
  },
  wheelColumn: {
    flex: 1,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 15,
    color: C.textSecondary,
    fontWeight: '500',
  },
  wheelItemTextActive: {
    fontSize: 17,
    color: C.text,
    fontWeight: '700',
  },

  // Calendar
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  calNavBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  calNavText: {
    fontSize: 20,
    fontWeight: '700',
    color: C.tint,
  },
  calHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calCellToday: {
    borderWidth: 1.5,
    borderColor: C.tint,
  },
  calCellSelected: {
    backgroundColor: C.tint,
  },
  calCellText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  calCellTextSelected: {
    color: C.tintText,
  },

  confirmBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },
  dimmed: { opacity: 0.7 },
});
