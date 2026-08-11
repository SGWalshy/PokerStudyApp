import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { NewActiveGoal, useAppData } from '@/state/app-data';
import { GoalProgress } from '@/utils/goal-progress';
import {
  DEFAULT_GOAL_COLOR,
  GOAL_COLORS,
  GoalMetric,
  GoalPeriod,
  METRIC_LABELS,
  METRIC_OPTIONS,
  METRIC_UNITS,
  PERIOD_LABELS,
  PERIOD_SHORT_LABELS,
  PERIOD_SUFFIX,
} from '@/utils/goal-templates';

const C = Colors.light;

const PERIOD_OPTIONS: GoalPeriod[] = ['day', 'week', 'month', 'total'];
const HANDS_PERIOD_OPTIONS: GoalPeriod[] = ['day', 'week', 'month'];

type SuggestionKey = 'review' | 'log' | 'bankroll';
type ActiveSheet = SuggestionKey | 'custom' | null;

interface Suggestion {
  key: SuggestionKey;
  color: string;
  title: string;
  description: string;
}

const SUGGESTIONS: Suggestion[] = [
  { key: 'review', color: C.tint, title: 'Review hands', description: 'Track how many hands you review, on whatever schedule fits.' },
  { key: 'log', color: C.gold, title: 'Log hands', description: 'Track how many hands you play and log.' },
  { key: 'bankroll', color: '#1B3A5C', title: 'Reach a bankroll target', description: 'Set a bankroll milestone to work toward — no deadline.' },
];

export interface EditGoalsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EditGoalsModal({ visible, onClose }: EditGoalsModalProps) {
  const { addActiveGoal, updateActiveGoal, removeActiveGoal, stats } = useAppData();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  // Review / Log / Bankroll suggestion form
  const [suggestionTarget, setSuggestionTarget] = useState('');
  const [suggestionPeriod, setSuggestionPeriod] = useState<GoalPeriod>('week');

  // Custom goal form
  const [customLabel, setCustomLabel] = useState('');
  const [customTarget, setCustomTarget] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [customMetric, setCustomMetric] = useState<GoalMetric>('custom');
  const [customPeriod, setCustomPeriod] = useState<GoalPeriod>('week');
  const [customColor, setCustomColor] = useState(DEFAULT_GOAL_COLOR);

  const startEdit = (progress: GoalProgress) => {
    setEditingId(progress.goal.id);
    setEditValue(String(progress.goal.target));
  };

  const commitEdit = () => {
    if (editingId) {
      const n = Number(editValue);
      if (!isNaN(n) && n > 0) updateActiveGoal(editingId, { target: n });
    }
    setEditingId(null);
  };

  const closeSheet = () => {
    setActiveSheet(null);
    setSuggestionTarget('');
    setSuggestionPeriod('week');
    setCustomLabel('');
    setCustomTarget('');
    setCustomUnit('');
    setCustomMetric('custom');
    setCustomPeriod('week');
    setCustomColor(DEFAULT_GOAL_COLOR);
  };

  const submitSuggestion = (key: SuggestionKey) => {
    const target = Number(suggestionTarget);
    if (!(target > 0)) return;

    const preset = SUGGESTIONS.find(s => s.key === key)!;
    let goal: NewActiveGoal;
    if (key === 'bankroll') {
      goal = { label: `Reach $${target} bankroll`, target, unit: '$', period: 'total', metric: 'bankroll_amount', color: preset.color };
    } else {
      const suffix = PERIOD_SUFFIX[suggestionPeriod];
      const verb = key === 'review' ? 'Review' : 'Log';
      goal = {
        label: `${verb} ${target} hands${suffix ? ` ${suffix}` : ''}`,
        target,
        unit: 'hands',
        period: suggestionPeriod,
        metric: key === 'review' ? 'hands_reviewed' : 'hands_logged',
        color: preset.color,
      };
    }
    addActiveGoal(goal);
    closeSheet();
  };

  const resolvedUnit = customMetric === 'custom' ? customUnit.trim() : METRIC_UNITS[customMetric];
  const canSubmitCustom = customLabel.trim().length > 0 && Number(customTarget) > 0 && resolvedUnit.length > 0;

  const submitCustomGoal = () => {
    if (!canSubmitCustom) return;
    addActiveGoal({
      label: customLabel.trim(),
      target: Number(customTarget),
      unit: resolvedUnit,
      period: customPeriod,
      metric: customMetric,
      color: customColor,
    });
    closeSheet();
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Edit Goals</Text>
            <Text style={styles.headerSubtitle}>Build a plan that fits how you play</Text>
          </View>
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

          {/* ── Active goals — shaded panel splits "picked" from "to pick" ── */}
          <View style={styles.activePanel}>
            <Text style={styles.sectionTitle}>Your Active Goals</Text>
            {stats.activeGoalProgress.length === 0 ? (
              <View style={styles.emptyActive}>
                <Text style={styles.emptyActiveIcon}>🌱</Text>
                <Text style={styles.emptyActiveText}>
                  Nothing here yet — add a goal below and it&apos;ll show up here, tracked automatically.
                </Text>
              </View>
            ) : (
              <View style={styles.activeList}>
                {stats.activeGoalProgress.map(progress => (
                  <ActiveGoalCard
                    key={progress.goal.id}
                    progress={progress}
                    editing={editingId === progress.goal.id}
                    editValue={editValue}
                    onEditValueChange={setEditValue}
                    onStartEdit={() => startEdit(progress)}
                    onCommitEdit={commitEdit}
                    onRemove={() => removeActiveGoal(progress.goal.id)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ── Suggested goals ── */}
          <Text style={styles.sectionTitle}>Suggested</Text>
          <View style={styles.suggestionList}>
            {SUGGESTIONS.map(s => (
              <View key={s.key} style={styles.suggestionCard}>
                <View style={[styles.suggestionDot, { backgroundColor: s.color }]} />
                <View style={styles.suggestionMiddle}>
                  <Text style={styles.suggestionTitle}>{s.title}</Text>
                  <Text style={styles.suggestionDesc}>{s.description}</Text>
                </View>
                <Pressable
                  onPress={() => { setActiveSheet(s.key); setSuggestionTarget(''); setSuggestionPeriod('week'); }}
                  style={({ pressed }) => [styles.suggestionAddBtn, pressed && styles.dimmed]}>
                  <Text style={styles.suggestionAddBtnText}>Add</Text>
                </Pressable>
              </View>
            ))}
          </View>

          {/* ── Custom goal ── */}
          <Pressable
            onPress={() => setActiveSheet('custom')}
            style={({ pressed }) => [styles.customCard, pressed && styles.dimmed]}>
            <Text style={styles.customCardText}>+ Create Your Own</Text>
          </Pressable>

          <View style={{ height: Spacing.six }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>

    {/* Review / Log — target + timeframe */}
    <Modal visible={activeSheet === 'review' || activeSheet === 'log'} transparent animationType="slide" onRequestClose={closeSheet}>
      <Pressable style={styles.sheetOverlay} onPress={closeSheet} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetTitle, styles.noMargin]}>{activeSheet === 'review' ? 'Review Hands' : 'Log Hands'}</Text>
          <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.sheetSub}>Set a target and how often it resets</Text>

        <Text style={styles.fieldLabel}>Target (hands)</Text>
        <TextInput
          style={styles.sheetInput}
          placeholder="e.g. 15"
          placeholderTextColor={C.textSecondary}
          value={suggestionTarget}
          onChangeText={setSuggestionTarget}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <Text style={styles.fieldLabel}>Timeframe</Text>
        <View style={styles.pickerRow}>
          {HANDS_PERIOD_OPTIONS.map(period => (
            <Pressable
              key={period}
              onPress={() => setSuggestionPeriod(period)}
              style={[styles.pickerPill, suggestionPeriod === period && styles.pickerPillActive]}>
              <Text style={[styles.pickerPillText, suggestionPeriod === period && styles.pickerPillTextActive]}>
                {PERIOD_LABELS[period]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => submitSuggestion(activeSheet as SuggestionKey)}
          disabled={!(Number(suggestionTarget) > 0)}
          style={({ pressed }) => [styles.sheetBtn, (pressed || !(Number(suggestionTarget) > 0)) && styles.dimmed]}>
          <Text style={styles.sheetBtnText}>Add Goal</Text>
        </Pressable>
        <View style={{ height: Spacing.three }} />
      </View>
    </Modal>

    {/* Bankroll — target only, no timeframe */}
    <Modal visible={activeSheet === 'bankroll'} transparent animationType="slide" onRequestClose={closeSheet}>
      <Pressable style={styles.sheetOverlay} onPress={closeSheet} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetTitle, styles.noMargin]}>Reach a Bankroll Target</Text>
          <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.sheetSub}>A running milestone — no reset, just your current total</Text>

        <Text style={styles.fieldLabel}>Target ($)</Text>
        <TextInput
          style={styles.sheetInput}
          placeholder="e.g. 5000"
          placeholderTextColor={C.textSecondary}
          value={suggestionTarget}
          onChangeText={setSuggestionTarget}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <Pressable
          onPress={() => submitSuggestion('bankroll')}
          disabled={!(Number(suggestionTarget) > 0)}
          style={({ pressed }) => [styles.sheetBtn, (pressed || !(Number(suggestionTarget) > 0)) && styles.dimmed]}>
          <Text style={styles.sheetBtnText}>Add Goal</Text>
        </Pressable>
        <View style={{ height: Spacing.three }} />
      </View>
    </Modal>

    {/* Create custom goal — bottom sheet */}
    <Modal visible={activeSheet === 'custom'} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.sheetOverlay} onPress={closeSheet} />
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Create a Goal</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>Name it, pick a colour, what it tracks, and a target</Text>

            <Text style={styles.fieldLabel}>Goal name</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g. Post-session journal entries"
              placeholderTextColor={C.textSecondary}
              value={customLabel}
              onChangeText={setCustomLabel}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />

            <Text style={styles.fieldLabel}>Colour</Text>
            <View style={styles.colorRow}>
              {GOAL_COLORS.map(color => (
                <Pressable key={color} onPress={() => setCustomColor(color)} style={styles.colorSwatchOuter}>
                  <View style={[styles.colorSwatchRing, customColor === color && { borderColor: color }]}>
                    <View style={[styles.colorSwatchInner, { backgroundColor: color }]} />
                  </View>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Track with</Text>
            <View style={styles.pickerRow}>
              {METRIC_OPTIONS.map(metric => (
                <Pressable
                  key={metric}
                  onPress={() => setCustomMetric(metric)}
                  style={[styles.pickerPill, customMetric === metric && styles.pickerPillActive]}>
                  <Text style={[styles.pickerPillText, customMetric === metric && styles.pickerPillTextActive]}>
                    {METRIC_LABELS[metric]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sheetRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Target</Text>
                <TextInput
                  style={styles.sheetInput}
                  placeholder="e.g. 5"
                  placeholderTextColor={C.textSecondary}
                  value={customTarget}
                  onChangeText={setCustomTarget}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Unit</Text>
                {customMetric === 'custom' ? (
                  <TextInput
                    style={styles.sheetInput}
                    placeholder="e.g. hands, %, buy-ins"
                    placeholderTextColor={C.textSecondary}
                    value={customUnit}
                    onChangeText={setCustomUnit}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                ) : (
                  <View style={[styles.sheetInput, styles.sheetInputReadonly]}>
                    <Text style={styles.sheetInputReadonlyText}>{resolvedUnit}</Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.fieldLabel}>Timeframe</Text>
            <View style={styles.pickerRow}>
              {PERIOD_OPTIONS.map(period => (
                <Pressable
                  key={period}
                  onPress={() => setCustomPeriod(period)}
                  style={[styles.pickerPill, customPeriod === period && styles.pickerPillActive]}>
                  <Text style={[styles.pickerPillText, customPeriod === period && styles.pickerPillTextActive]}>
                    {PERIOD_LABELS[period]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={submitCustomGoal}
              disabled={!canSubmitCustom}
              style={({ pressed }) => [styles.sheetBtn, (pressed || !canSubmitCustom) && styles.dimmed]}>
              <Text style={styles.sheetBtnText}>Save Goal</Text>
            </Pressable>
            <View style={{ height: Spacing.three }} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ── Active goal card ────────────────────────────────────────────────────────

function ActiveGoalCard({
  progress,
  editing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onCommitEdit,
  onRemove,
}: {
  progress: GoalProgress;
  editing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onRemove: () => void;
}) {
  const { goal, done, pct, completed } = progress;
  const remaining = Math.max(0, goal.target - done);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      friction: 6,
      tension: 60,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.activeCard,
        { borderLeftColor: goal.color || DEFAULT_GOAL_COLOR },
        {
          opacity: anim,
          transform: [
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}>
      <View style={styles.activeCardTop}>
        <View style={styles.activeCardMiddle}>
          <View style={styles.activeCardTitleRow}>
            <Text style={[styles.activeCardLabel, completed && styles.activeCardLabelDone]}>
              {goal.label}
            </Text>
            <Text style={styles.activeCardPeriod}>{PERIOD_SHORT_LABELS[goal.period]}</Text>
          </View>

          {editing ? (
            <View style={styles.editRow}>
              <Text style={styles.editRowLabel}>Target</Text>
              <TextInput
                style={styles.editInput}
                value={editValue}
                onChangeText={onEditValueChange}
                onBlur={onCommitEdit}
                onSubmitEditing={() => { onCommitEdit(); Keyboard.dismiss(); }}
                keyboardType="number-pad"
                returnKeyType="done"
                autoFocus
              />
              <Text style={styles.editRowLabel}>{goal.unit}</Text>
            </View>
          ) : (
            <Text style={styles.activeCardProgress}>
              {completed
                ? `Completed this ${goal.period === 'total' ? 'goal' : goal.period}`
                : `${done} of ${goal.target} ${goal.unit} · ${remaining} remaining`}
            </Text>
          )}
        </View>

        {completed ? (
          <View style={styles.doneBadge}>
            <Text style={styles.doneBadgeText}>✓</Text>
          </View>
        ) : (
          <Text style={styles.activePct}>{pct}%</Text>
        )}
      </View>

      <View style={styles.track}>
        <View style={[styles.trackFill, { flex: completed ? 1 : pct / 100 }]} />
        <View style={{ flex: completed ? 0 : 1 - pct / 100 }} />
      </View>

      <View style={styles.cardActions}>
        <Pressable onPress={onStartEdit} hitSlop={8} style={({ pressed }) => [styles.cardActionBtn, pressed && styles.dimmed]}>
          <Text style={styles.cardActionIcon}>✎</Text>
          <Text style={styles.cardActionLabel}>Edit target</Text>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8} style={({ pressed }) => [styles.cardActionBtn, pressed && styles.dimmed]}>
          <Text style={styles.cardActionIcon}>×</Text>
          <Text style={styles.cardActionLabel}>Remove</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: C.backgroundElement,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 3,
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

  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },

  // Shaded panel — visually splits "what you've picked" from "what's available"
  activePanel: {
    backgroundColor: C.backgroundSelected,
    borderRadius: 18,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },

  // Active goals — empty state
  emptyActive: {
    backgroundColor: C.background,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
  },
  emptyActiveIcon: { fontSize: 28, marginBottom: Spacing.two },
  emptyActiveText: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Active goal card
  activeList: { gap: Spacing.two },
  activeCard: {
    backgroundColor: C.background,
    borderRadius: 16,
    padding: Spacing.three,
    borderLeftWidth: 4,
  },
  activeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  activeCardMiddle: { flex: 1 },
  activeCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 2,
  },
  activeCardLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    flexShrink: 1,
  },
  activeCardLabelDone: {
    color: C.textSecondary,
    textDecorationLine: 'line-through',
  },
  activeCardPeriod: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
  },
  activeCardProgress: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '500',
  },
  activePct: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tint,
    marginLeft: Spacing.two,
  },
  doneBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.two,
  },
  doneBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.tintText,
  },

  // Inline target-edit row
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editRowLabel: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '500',
  },
  editInput: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    backgroundColor: C.backgroundSelected,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 48,
  },

  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.backgroundSelected,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 4,
  },
  trackFill: {
    height: 6,
    backgroundColor: C.tint,
    borderRadius: 3,
  },

  cardActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: 4,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardActionIcon: {
    fontSize: 12,
    color: C.textSecondary,
  },
  cardActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
  },

  // Suggested goal cards
  suggestionList: { gap: Spacing.two, marginBottom: Spacing.four },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    padding: Spacing.three,
  },
  suggestionDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: Spacing.three,
  },
  suggestionMiddle: { flex: 1, marginRight: Spacing.two },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 2,
  },
  suggestionDesc: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },
  suggestionAddBtn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  suggestionAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.tintText,
  },

  // Custom goal card
  customCard: {
    borderWidth: 1.5,
    borderColor: C.tint,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
  },
  customCardText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.tint,
  },

  // Bottom sheets
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.backgroundSelected,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  noMargin: { marginBottom: 0 },
  sheetSub: {
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: Spacing.three,
  },
  sheetRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
    marginBottom: 6,
  },
  sheetInput: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.text,
    marginBottom: Spacing.three,
  },
  sheetInputReadonly: {
    justifyContent: 'center',
  },
  sheetInputReadonlyText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSecondary,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.three,
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
  sheetBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sheetBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },

  dimmed: { opacity: 0.7 },
});
