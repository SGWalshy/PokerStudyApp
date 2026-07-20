import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

const MINUTE_STEPS = [0, 15, 30, 45];

function to12Hour(hour24: number): { hour12: number; isPM: boolean } {
  const isPM = hour24 >= 12;
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, isPM };
}
function to24Hour(hour12: number, isPM: boolean): number {
  if (hour12 === 12) return isPM ? 12 : 0;
  return isPM ? hour12 + 12 : hour12;
}

export interface TimePickerModalProps {
  visible: boolean;
  value: string; // "HH:MM", 24-hour
  onClose: () => void;
  onSave: (value: string) => void;
}

export function TimePickerModal({ visible, value, onClose, onSave }: TimePickerModalProps) {
  const [hour24, setHour24] = useState(8);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const [h, m] = value.split(':').map(Number);
    setHour24(Number.isFinite(h) ? h : 8);
    setMinute(Number.isFinite(m) ? m : 0);
  }, [visible, value]);

  const { hour12, isPM } = to12Hour(hour24);

  function adjustHour(delta: number) {
    let next = hour12 + delta;
    if (next > 12) next = 1;
    if (next < 1) next = 12;
    setHour24(to24Hour(next, isPM));
  }

  function adjustMinute(delta: number) {
    const idx = MINUTE_STEPS.indexOf(minute);
    const currentIdx = idx === -1 ? 0 : idx;
    const nextIdx = (currentIdx + delta + MINUTE_STEPS.length) % MINUTE_STEPS.length;
    setMinute(MINUTE_STEPS[nextIdx]);
  }

  function handleSave() {
    onSave(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Reminder Time</Text>

        <View style={styles.pickerRow}>
          <Stepper label={String(hour12)} onDec={() => adjustHour(-1)} onInc={() => adjustHour(1)} />
          <Text style={styles.colon}>:</Text>
          <Stepper label={String(minute).padStart(2, '0')} onDec={() => adjustMinute(-1)} onInc={() => adjustMinute(1)} />

          <View style={styles.ampmCol}>
            <Pressable
              onPress={() => setHour24(to24Hour(hour12, false))}
              style={[styles.ampmBtn, !isPM && styles.ampmBtnActive]}>
              <Text style={[styles.ampmText, !isPM && styles.ampmTextActive]}>AM</Text>
            </Pressable>
            <Pressable
              onPress={() => setHour24(to24Hour(hour12, true))}
              style={[styles.ampmBtn, isPM && styles.ampmBtnActive]}>
              <Text style={[styles.ampmText, isPM && styles.ampmTextActive]}>PM</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveBtn, pressed && styles.dimmed]}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Stepper({ label, onDec, onInc }: { label: string; onDec: () => void; onInc: () => void }) {
  return (
    <View style={styles.stepperCol}>
      <Pressable onPress={onInc} hitSlop={8} style={({ pressed }) => [styles.stepperBtn, pressed && styles.dimmed]}>
        <Text style={styles.stepperBtnText}>▲</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{label}</Text>
      <Pressable onPress={onDec} hitSlop={8} style={({ pressed }) => [styles.stepperBtn, pressed && styles.dimmed]}>
        <Text style={styles.stepperBtnText}>▼</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,20,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.backgroundSelected,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: Spacing.four,
    textAlign: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  stepperCol: {
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 6,
  },
  stepperBtn: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  stepperBtnText: {
    fontSize: 13,
    color: C.tint,
  },
  stepperValue: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    minWidth: 40,
    textAlign: 'center',
  },
  colon: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
  },
  ampmCol: {
    gap: 6,
  },
  ampmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.backgroundElement,
  },
  ampmBtnActive: {
    backgroundColor: C.tint,
  },
  ampmText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSecondary,
  },
  ampmTextActive: {
    color: C.tintText,
  },
  saveBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },
  dimmed: {
    opacity: 0.7,
  },
});
