import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { CURRENCIES, CurrencyCode } from '@/utils/currency';

const C = Colors.light;

export interface CurrencyPickerModalProps {
  visible: boolean;
  value: CurrencyCode;
  onClose: () => void;
  onSelect: (code: CurrencyCode) => void;
}

export function CurrencyPickerModal({ visible, value, onClose, onSelect }: CurrencyPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Currency</Text>
        {CURRENCIES.map((c, i) => {
          const selected = c.code === value;
          return (
            <Pressable
              key={c.code}
              onPress={() => { onSelect(c.code); onClose(); }}
              style={({ pressed }) => [
                styles.row,
                i === CURRENCIES.length - 1 && styles.rowLast,
                pressed && styles.dimmed,
              ]}>
              <Text style={styles.rowText}>
                {c.code} — {c.label} ({c.symbol})
              </Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </Modal>
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
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
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.backgroundElement,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowText: {
    fontSize: 16,
    color: C.text,
  },
  check: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tint,
  },
  dimmed: {
    opacity: 0.7,
  },
});
