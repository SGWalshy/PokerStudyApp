import { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/state/app-data';
import { Colors, Spacing } from '@/constants/theme';
import {
  ActiveGoal,
  GOAL_COLORS,
  GoalMetric,
  GoalPeriod,
  METRIC_LABELS,
  METRIC_OPTIONS,
  METRIC_UNITS,
  PERIOD_LABELS,
} from '@/utils/goal-templates';

const C = Colors.light;

const PERIOD_OPTIONS: GoalPeriod[] = ['day', 'week', 'month', 'total'];

export interface EditGoalModalProps {
  goal: ActiveGoal | null;
  onClose: () => void;
}

export function EditGoalModal({ goal, onClose }: EditGoalModalProps) {
  const { updateActiveGoal, removeActiveGoal } = useAppData();

  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('week');
  const [color, setColor] = useState('');
  const [metric, setMetric] = useState<GoalMetric>('custom');
  const [customUnit, setCustomUnit] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Re-seed the form whenever a different goal is opened.
  useEffect(() => {
    if (goal) {
      setLabel(goal.label);
      setTarget(String(goal.target));
      setPeriod(goal.period);
      setColor(goal.color);
      setMetric(goal.metric);
      setCustomUnit(goal.unit);
      setConfirmingDelete(false);
    }
  }, [goal]);

  if (!goal) return null;

  const resolvedUnit = metric === 'custom' ? customUnit.trim() : METRIC_UNITS[metric];
  const canSave = label.trim().length > 0 && Number(target) > 0 && resolvedUnit.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    updateActiveGoal(goal.id, {
      label: label.trim(),
      target: Number(target),
      period,
      color,
      metric,
      unit: resolvedUnit,
    });
    onClose();
  };

  const handleDelete = () => {
    removeActiveGoal(goal.id);
    onClose();
  };

  return (
    <Modal visible={!!goal} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Edit Goal</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && styles.dimmed]}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          showsVerticalScrollIndicator={false}>

          <Text style={styles.fieldLabel}>Goal name</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholderTextColor={C.textSecondary}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          <Text style={styles.fieldLabel}>Colour</Text>
          <View style={styles.colorRow}>
            {GOAL_COLORS.map(c => (
              <Pressable key={c} onPress={() => setColor(c)} style={styles.colorSwatchOuter}>
                <View style={[styles.colorSwatchRing, color === c && { borderColor: c }]}>
                  <View style={[styles.colorSwatchInner, { backgroundColor: c }]} />
                </View>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Track with</Text>
          <View style={styles.pickerRow}>
            {METRIC_OPTIONS.map(m => (
              <Pressable
                key={m}
                onPress={() => setMetric(m)}
                style={[styles.pickerPill, metric === m && styles.pickerPillActive]}>
                <Text style={[styles.pickerPillText, metric === m && styles.pickerPillTextActive]}>
                  {METRIC_LABELS[m]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.targetRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Target</Text>
              <TextInput
                style={styles.input}
                value={target}
                onChangeText={setTarget}
                keyboardType="number-pad"
                placeholderTextColor={C.textSecondary}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Unit</Text>
              {metric === 'custom' ? (
                <TextInput
                  style={styles.input}
                  placeholder="e.g. hands, %, buy-ins"
                  placeholderTextColor={C.textSecondary}
                  value={customUnit}
                  onChangeText={setCustomUnit}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              ) : (
                <View style={[styles.input, styles.inputReadonly]}>
                  <Text style={styles.inputReadonlyText}>{resolvedUnit}</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.fieldLabel}>Timeframe</Text>
          <View style={styles.pickerRow}>
            {PERIOD_OPTIONS.map(p => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.pickerPill, period === p && styles.pickerPillActive]}>
                <Text style={[styles.pickerPillText, period === p && styles.pickerPillTextActive]}>
                  {PERIOD_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={({ pressed }) => [styles.saveBtn, (pressed || !canSave) && styles.dimmed]}>
            <Text style={styles.saveBtnText}>Save Changes</Text>
          </Pressable>

          {confirmingDelete ? (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmText}>Delete this goal? This can&apos;t be undone.</Text>
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setConfirmingDelete(false)}
                  style={({ pressed }) => [styles.confirmCancelBtn, pressed && styles.dimmed]}>
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleDelete}
                  style={({ pressed }) => [styles.confirmDeleteBtn, pressed && styles.dimmed]}>
                  <Text style={styles.confirmDeleteText}>Delete Goal</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setConfirmingDelete(true)}
              style={({ pressed }) => [styles.deleteBtn, pressed && styles.dimmed]}>
              <Text style={styles.deleteBtnText}>Delete Goal</Text>
            </Pressable>
          )}

          <View style={{ height: Spacing.six }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: C.backgroundElement,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 15, color: C.textSecondary, fontWeight: '600' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.text,
    marginBottom: Spacing.three,
  },
  inputReadonly: {
    justifyContent: 'center',
  },
  inputReadonlyText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSecondary,
  },
  targetRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },

  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.three,
  },
  colorSwatchOuter: {
    padding: 2,
  },
  colorSwatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },

  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.four,
  },
  pickerPill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: C.backgroundElement,
  },
  pickerPillActive: {
    backgroundColor: C.tint,
  },
  pickerPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
  },
  pickerPillTextActive: {
    color: C.tintText,
  },

  saveBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },

  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.negative,
  },

  confirmRow: {
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    padding: Spacing.three,
  },
  confirmText: {
    fontSize: 14,
    color: C.text,
    marginBottom: Spacing.three,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  confirmCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: C.backgroundSelected,
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  confirmDeleteBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: C.negative,
  },
  confirmDeleteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  dimmed: { opacity: 0.7 },
});
