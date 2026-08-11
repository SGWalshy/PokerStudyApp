import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import * as Haptics from 'expo-haptics';

import { Colors, Spacing } from '@/constants/theme';
import { withTimeout } from '@/utils/promise-utils';
import { CardFace, CardPicker } from './card-picker';
import { TableDiagram } from './table-diagram';
import { HandHistoryCard, VillainCardsToggle } from './hand-history-card';
import {
  ActionEntry,
  AnyAction,
  AnteType,
  CardType,
  HandDraft,
  INITIAL_DRAFT,
  POSITION_LABELS,
  Rank,
  autoHandName,
  cardLabel,
  buildPreflopInvestments,
  computePreflopState,
  computeStreetState,
  SidePot,
  computeSidePots,
  getFullPreflopActorOrder,
  getPreflopActingOrder,
  getStreetActors,
  isBettingComplete,
  getNextActor,
  inferPotType,
  computeHandOutcome,
  computeHandMath,
  computeFoldWinNet,
  computePotBeforeDecisiveFold,
  villainLabel,
  heroLabel,
  fmtSize,
  fmtCompact,
  fmtDualAmount,
  shouldSkipStreetAction,
  isAllInRunout,
} from './types';

const C = Colors.light;
const VILLAIN_COLORS = ['#C04040', '#D4683A', '#C8942A'];
const HERO_COLOR     = '#1B4332';
const UNNAMED_COLOR  = '#8A7A6A';
// iOS-only keyboard toolbar shown above the numeric pad for the tournament
// Small Blind / Big Blind fields. Each field gets its OWN nativeID rather
// than sharing one — a single shared InputAccessoryView reliably shows for
// whichever field focuses first but can silently fail to reattach when focus
// moves directly from one TextInput to another sharing the same nativeID, so
// giving each its own dedicated (identical-looking) accessory sidesteps it.
const BLINDS_SB_ACCESSORY_ID = 'blinds-confirm-accessory-sb';
const BLINDS_BB_ACCESSORY_ID = 'blinds-confirm-accessory-bb';

// Static "this is the active section" treatment for the Blinds screen's
// input groups — solid green outline plus a faint tint of the same colour.
// No animation. (Position screen keeps its own local glowStyle, unchanged.)
function sectionHighlightStyle(active: boolean) {
  if (!active) return {};
  return {
    borderColor: HERO_COLOR,
    backgroundColor: HERO_COLOR + '14',
  };
}

const ACTION_COLORS: Record<string, string> = {
  check: '#2E7D52', call: '#2E7D52', bet: '#1565C0',
  raise: '#C04040', allin: '#C04040', fold: '#888',
};

// ── Accordion transitions ────────────────────────────────────────────────────
// Old Android without Fabric needs this opt-in for LayoutAnimation to fire.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Drives the height/layout side of a section collapsing or re-expanding —
// 250ms ease-out, matching the collapse/expand spec. Newly *appearing*
// sections get their own explicit slide+fade (AppearingSection, below)
// instead of LayoutAnimation's "create", so the two don't double-animate;
// this config only covers resizing an already-mounted section and fading
// out one that's removed entirely (e.g. a downstream reset).
const ACCORDION_LAYOUT_ANIM = {
  duration: 250,
  update: { type: LayoutAnimation.Types.easeOut },
  delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
};

function animateAccordion() {
  LayoutAnimation.configureNext(ACCORDION_LAYOUT_ANIM);
}

// ── Explicit Animated-API pieces ─────────────────────────────────────────────
// A gentle, fixed-duration "pop" rather than an indeterminate spring — reads
// as a bounce but still respects an exact 200ms budget.
const CHECK_BOUNCE_EASING = Easing.out(Easing.back(1.7));

function AnimatedCheckmark() {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration: 200,
      easing: CHECK_BOUNCE_EASING,
      useNativeDriver: true,
    }).start();
  }, [scale]);
  return (
    <Animated.Text style={[styles.sectionCheckmark, { transform: [{ scale }] }]}>✓</Animated.Text>
  );
}

// Wraps a section that's just appeared in the flow for the first time —
// slides up 20px while fading in, 300ms ease-out. Mounts once per section
// (React swaps it in fresh when the section's `step >= N` guard first
// passes), so the effect firing on mount is exactly the "just appeared" moment.
function AppearingSection({ children }: { children: ReactNode }) {
  const translateY = useRef(new Animated.Value(20)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ── Shared press/selection animation primitives ─────────────────────────────
// Every interactive control in this flow routes through these so the whole
// modal feels consistent instead of each button reinventing its own timing.

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

// Tactile press feedback: scale to 0.97 on press-in, back to 1 on release/
// cancel, 100ms each way — fast enough to read as "physical", not sluggish.
function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.timing(scale, { toValue: 0.97, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.timing(scale, { toValue: 1, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  };
  return { scale, onPressIn, onPressOut };
}

// Cross-fades between an "off" and "on" color pair over 150ms whenever
// `active` flips — used for every selectable chip/card/preset in the flow so
// picking an option reads as a smooth fill instead of an instant color snap.
// backgroundColor/borderColor/color aren't native-driver-eligible, so this
// value always animates on the JS thread (fine at 150ms for a single chip).
function useFillAnim(active: boolean) {
  const fill = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: active ? 1 : 0, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  }, [active, fill]);
  return fill;
}

// Fades in while sliding up slightly — the shared "this just became
// available/relevant" entrance used for the Continue button appearing,
// freshly-committed action pills, and the Tag & Save screen's stagger.
// `delay` lets a list stagger its items instead of popping in together.
function FadeSlideIn({ children, duration = 200, distance = 12, delay = 0, axis = 'y', style }: {
  children: ReactNode; duration?: number; distance?: number; delay?: number; axis?: 'x' | 'y'; style?: object;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    // Intentionally mount-only — this marks "I just appeared", not "my props changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return (
    <Animated.View style={[style, {
      opacity: progress,
      transform: [axis === 'x' ? { translateX: offset } : { translateY: offset }],
    }]}>
      {children}
    </Animated.View>
  );
}

// Generic press-scale wrapper for one-off buttons that don't warrant their
// own named component (Share/Save/action buttons etc.) — same 0.97/100ms
// feedback as NextBtn/SkipBtn/Chip, just without prescribing a text style.
function ScaleButton({ onPress, disabled, style, children }: {
  onPress: () => void; disabled?: boolean; style?: object; children: ReactNode;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <AnimatedPressableBase onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled}
      style={[style, { transform: [{ scale }] }]}>
      {children}
    </AnimatedPressableBase>
  );
}

function DoneLink() {
  return (
    <Pressable onPress={() => Keyboard.dismiss()} style={styles.doneLinkWrap} hitSlop={8}>
      <Text style={styles.doneLinkText}>Done</Text>
    </Pressable>
  );
}

function abbrevPos(pos: string): string {
  const map: Record<string, string> = { 'BTN/SB': 'BTN', 'UTG+1': 'U+1', 'UTG+2': 'U+2' };
  return map[pos] ?? pos;
}

// ── Remaining-stack helper ────────────────────────────────────────────────────

function getRemainingStack(
  actor: string,
  draft: HandDraft,
  street: 'preflop' | 'flop' | 'turn' | 'river',
): number | null {
  // A villain with no stack entered is assumed to share the effective stack,
  // same convention ActionInput already uses for its own stackBB fallback —
  // otherwise the stack bar shows a confusing "?" for the common case where
  // the user never bothered typing a villain stack in the Position section.
  const heroStack = draft.effectiveStackBB || draft.effectiveStack;
  const start = actor === 'hero'
    ? heroStack
    : (draft.villainStacksBB[actor] && draft.villainStacksBB[actor] > 0 ? draft.villainStacksBB[actor] : heroStack);
  if (!start || start <= 0) return null;

  const sbBB    = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradBB = draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const ao      = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const initInv = buildPreflopInvestments(ao, sbBB, stradBB, draft.playerCount);
  const pf      = computePreflopState(draft.preflopActions, sbBB, stradBB, initInv);
  let   invested = pf.investedBB[actor] ?? 0;

  if (street === 'preflop') return Math.max(0, start - invested);

  const basePot = pf.potBB;
  const flop = computeStreetState(draft.flopActions, basePot);
  invested += flop.investedBB[actor] ?? 0;
  if (street === 'flop') return Math.max(0, start - invested);

  const turn = computeStreetState(draft.turnActions, flop.potBB);
  invested += turn.investedBB[actor] ?? 0;
  if (street === 'turn') return Math.max(0, start - invested);

  const river = computeStreetState(draft.riverActions, turn.potBB);
  invested += river.investedBB[actor] ?? 0;
  return Math.max(0, start - invested);
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function NextBtn({ onPress, disabled, label = 'Continue' }: { onPress: () => void; disabled?: boolean; label?: string }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <AnimatedPressableBase onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled}
      style={[styles.nextBtn, disabled && styles.nextBtnOff, { transform: [{ scale }] }]}>
      <Text style={[styles.nextBtnText, disabled && styles.nextBtnTextOff]}>{label}</Text>
    </AnimatedPressableBase>
  );
}

function SkipBtn({ onPress, label }: { onPress: () => void; label: string }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <AnimatedPressableBase onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}
      style={[styles.skipBtn, { transform: [{ scale }] }]}>
      <Text style={styles.skipBtnText}>{label}</Text>
    </AnimatedPressableBase>
  );
}

// Selecting a Chip cross-fades its fill (150ms) instead of snapping — and
// like every other control here, presses get the same 0.97 tactile scale.
// The scale (native driver — transform) and the fill (JS driver —
// background/border/text color aren't native-animatable) are on two
// DIFFERENT Animated.Values, but React Native still requires them to live
// on separate style objects: a native-driven and a JS-driven animated value
// in the SAME component's style throws "Attempting to run JS driver
// animation on animated node that has been moved to native". So the scale
// goes on an outer wrapper and the color fill on the inner Pressable.
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const fill = useFillAnim(active);
  const backgroundColor = fill.interpolate({ inputRange: [0, 1], outputRange: [C.backgroundElement, HERO_COLOR] });
  const borderColor     = fill.interpolate({ inputRange: [0, 1], outputRange: [C.text, HERO_COLOR] });
  const textColor       = fill.interpolate({ inputRange: [0, 1], outputRange: [C.text, C.background] });
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <AnimatedPressableBase onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}
        style={[styles.chip, { backgroundColor, borderColor }]}>
        <Animated.Text style={[styles.chipText, { color: textColor }]}>{label}</Animated.Text>
      </AnimatedPressableBase>
    </Animated.View>
  );
}

// A self-contained segmented control — its own rounded-rect border, both
// options the same fixed width with identical padding so "BB" and "Chips"
// don't visually lopside it, filled tint + cream text on whichever is
// selected. The end segments carry their own matching corner radius rather
// than depending on the container clipping them, so the selected fill sits
// flush against the border with no gap or seam.
function UnitToggle({ unit, onPress, accent }: { unit: 'BB' | 'Chips'; onPress: (u: 'BB' | 'Chips') => void; accent?: string }) {
  return (
    <View style={styles.unitToggle}>
      {(['BB', 'Chips'] as const).map((u, i) => (
        <Pressable key={u} onPress={() => onPress(u)}
          style={[
            styles.unitBtn,
            i === 0 && styles.unitBtnFirst,
            i === 1 && styles.unitBtnLast,
            i === 1 && styles.unitBtnDivider,
            unit === u && { backgroundColor: accent ?? C.tint },
          ]}>
          <Text style={[styles.unitBtnText, unit === u && styles.unitBtnTextActive]}>{u}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// A numeric field with its own local text buffer so the user can freely
// delete every character — including the last one — before typing a fresh
// number. A plain controlled input bound straight to a parsed draft value
// snaps back to the last valid digit the instant the field goes empty,
// because an empty string never parses to a number worth committing; this
// only syncs from `displayValue` while the field ISN'T focused, so mid-edit
// text (including '') is never overwritten out from under the user.
function BufferedNumInput({ displayValue, onChangeText, onBlurCommit, onFocusInput, onSubmit, inputAccessoryViewID, placeholder, style }: {
  displayValue: string;
  onChangeText: (text: string) => void;
  onBlurCommit?: (text: string) => void;
  onFocusInput?: () => void;
  onSubmit?: () => void;
  inputAccessoryViewID?: string;
  placeholder?: string;
  style?: object;
}) {
  const [text, setText] = useState(displayValue);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(displayValue);
  }, [displayValue]);

  return (
    <TextInput
      style={style ?? styles.numInput}
      keyboardType="numeric"
      selectTextOnFocus
      value={focused.current ? text : displayValue}
      onFocus={() => { focused.current = true; setText(displayValue); onFocusInput?.(); }}
      onChangeText={(t) => { setText(t); onChangeText(t); }}
      onBlur={() => { focused.current = false; onBlurCommit?.(text); }}
      // Android's numeric keypad shows its own "done" key since it has no
      // accessory-view mechanism; iOS's numeric keypad has neither, which is
      // exactly what inputAccessoryViewID (wired by the caller) covers.
      returnKeyType={onSubmit ? 'done' : undefined}
      onSubmitEditing={onSubmit}
      inputAccessoryViewID={inputAccessoryViewID}
      placeholder={placeholder}
      placeholderTextColor={C.textSecondary}
    />
  );
}

// ── Action row display ────────────────────────────────────────────────────────

function fmtActionLabel(entry: ActionEntry): string {
  switch (entry.action) {
    case 'fold':  return 'Fold';
    case 'check': return 'Check';
    case 'call':  return `Call ${fmtSize(entry.sizingBB)}BB`;
    case 'bet':   return `Bet ${fmtSize(entry.sizingBB)}BB`;
    case 'raise': return `Raise → ${fmtSize(entry.sizingBB)}BB`;
    case 'allin': return `All-In ${fmtSize(entry.sizingBB)}BB`;
    default:      return entry.action;
  }
}

// Each row mounts fresh exactly once — the moment its action is committed
// (the list is append-only within a street) — so a plain mount-triggered
// FadeSlideIn is exactly "this pill just landed", not a re-render artifact.
function ActionRow({ playerLabel, dotColor, entry }: { playerLabel: string; dotColor: string; entry: ActionEntry }) {
  const color = ACTION_COLORS[entry.action] ?? '#999';
  return (
    <FadeSlideIn duration={200} distance={16} axis="x">
      <View style={styles.actionRow}>
        <View style={styles.actionRowLeft}>
          <View style={[styles.actorDot, { backgroundColor: dotColor }]} />
          <Text style={styles.actorLabel} numberOfLines={1}>{playerLabel}</Text>
        </View>
        <View style={[styles.actionBadge, { borderColor: color }]}>
          <Text style={[styles.actionBadgeText, { color }]}>{fmtActionLabel(entry)}</Text>
        </View>
      </View>
    </FadeSlideIn>
  );
}

// ── Stack bar ─────────────────────────────────────────────────────────────────

function StackBar({ actors, draft, street }: {
  actors: string[];
  draft: HandDraft;
  street: 'preflop' | 'flop' | 'turn' | 'river';
}) {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  const getPosLabel = (a: string) => {
    if (a === 'hero') return labels[draft.heroSeat ?? 0] ?? heroLabel(draft.heroName);
    if (a.startsWith('villain')) { const vi = parseInt(a.replace('villain',''),10)-1; return labels[draft.villainSeats[vi]??0] ?? villainLabel(a, draft.villainNames); }
    return '?';
  };
  const dotColor = (a: string) => a === 'hero' ? HERO_COLOR : a.startsWith('villain') ? (VILLAIN_COLORS[parseInt(a.replace('villain',''),10)-1] ?? VILLAIN_COLORS[0]) : UNNAMED_COLOR;

  return (
    <View style={styles.stackBar}>
      {actors.map(a => {
        const rem = getRemainingStack(a, draft, street);
        return (
          <View key={a} style={styles.stackBarItem}>
            <View style={[styles.stackBarDot, { backgroundColor: dotColor(a) }]} />
            <Text style={styles.stackBarLabel}>{getPosLabel(a)}</Text>
            <Text style={styles.stackBarVal}>{rem !== null ? `${fmtSize(rem)}BB` : '?'}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Side Pot Display ─────────────────────────────────────────────────────────

function SidePotStrip({
  pots,
  actorLabel,
}: {
  pots: SidePot[];
  actorLabel: (actor: string) => string;
}) {
  // Only display when there are genuinely contested separate pots
  const contested = pots.filter(p => p.eligible.length >= 2);
  if (contested.length < 2) return null;
  return (
    <View style={styles.sidePotRow}>
      {contested.map((p, i) => {
        const named = p.eligible.filter(a => a === 'hero' || a.startsWith('villain'));
        const label = named.map(actorLabel).join(' + ') + (p.eligible.length > named.length ? ` +${p.eligible.length - named.length}` : '');
        return (
          <View key={i} style={styles.sidePotChip}>
            <Text style={styles.sidePotLabel}>{i === 0 ? 'Main' : `Side ${i}`}</Text>
            <Text style={styles.sidePotAmt}>{fmtSize(p.amount)}BB</Text>
            <Text style={styles.sidePotElig}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// Shown directly above the bet-sizing controls on every street so the pot is
// visible at the exact moment a sizing decision is being made — updates live
// off the same potBB the sizing math itself uses, and respects whichever
// unit this hand is tracked in.
function PotBadge({ potBB, draft }: { potBB: number; draft: HandDraft }) {
  return (
    <View style={styles.potBadge}>
      <Text style={styles.potBadgeText}>Pot: {fmtDualAmount(potBB, draft)}</Text>
    </View>
  );
}

// ── Action Input ──────────────────────────────────────────────────────────────

interface ActionInputProps {
  actor: string;
  posLabel: string;
  heroName?: string;
  villainName?: string;
  currentBetBB: number;
  potBB: number;
  stackBB: number;
  minRaiseBB: number;
  investedBB: number;
  isPreflop: boolean;
  bigBlind: number;
  gameType: HandDraft['gameType'];
  canRaise?: boolean;
  preSelectedAction?: AnyAction;
  initialSizingBB?: number;
  onConfirm: (action: AnyAction, sizingBB: number) => void;
  onSizingChange?: (sizeBB: number | null) => void;
  // Fires the moment the sizing panel opens, so the parent can scroll it
  // (and its Confirm button) into view rather than leaving it below the fold.
  onSizingOpen?: () => void;
}

function ActionInput({
  actor, posLabel, heroName, villainName, currentBetBB, potBB, stackBB, minRaiseBB,
  investedBB, isPreflop, bigBlind, gameType, canRaise = true,
  preSelectedAction, initialSizingBB, onConfirm, onSizingChange, onSizingOpen,
}: ActionInputProps) {
  const isHero    = actor === 'hero';
  const isVillain = actor.startsWith('villain');
  const vi        = isVillain ? parseInt(actor.replace('villain', ''), 10) - 1 : -1;
  const accent    = isHero ? HERO_COLOR : isVillain ? (VILLAIN_COLORS[vi] ?? VILLAIN_COLORS[0]) : UNNAMED_COLOR;

  const callAmt   = Math.max(0, currentBetBB - investedBB);
  const fullStack = Math.max(0, stackBB);
  const isCallAllin = callAmt > 0 && fullStack > 0 && fullStack <= callAmt;

  const computeDefault = () => {
    if (initialSizingBB && initialSizingBB > 0) return initialSizingBB;
    return Math.max(minRaiseBB || 1, currentBetBB * 2 || 2);
  };

  const [showSizing, setShowSizing]     = useState(false);
  const [sizingBB,   setSizingBB]       = useState(computeDefault);
  const [typedText,  setTypedText]      = useState('');
  const [sizeFieldFocused, setSizeFieldFocused] = useState(false);
  const [sizeUnit,   setSizeUnit]       = useState<'BB' | 'Chips'>('BB');
  const [raiseAction, setRaiseAction]   = useState<'raise' | 'bet'>('raise');

  useEffect(() => {
    const newDefault = initialSizingBB && initialSizingBB > 0
      ? initialSizingBB
      : Math.max(minRaiseBB || 1, currentBetBB * 2 || 2);
    setShowSizing(false);
    setTypedText('');
    setSizingBB(newDefault);
    onSizingChange?.(null);
  }, [actor]);

  const openSizing = () => {
    const a = (isPreflop || currentBetBB > 0) ? 'raise' : 'bet';
    setRaiseAction(a);
    if (showSizing) { setShowSizing(false); onSizingChange?.(null); return; }
    setShowSizing(true);
    onSizingChange?.(sizingBB);
  };

  // Scroll the sizing panel (and its Confirm button) into view the moment
  // it opens — otherwise it can render below the fold with nothing to
  // indicate there's more to see.
  useEffect(() => {
    if (showSizing) onSizingOpen?.();
  }, [showSizing]);

  const handleUnit = (u: 'BB' | 'Chips') => {
    if (u === sizeUnit) return;
    if (u === 'Chips' && bigBlind > 0) setTypedText(fmtSize(sizingBB * bigBlind));
    else if (u === 'BB' && bigBlind > 0) {
      const chips = parseFloat(typedText);
      if (!isNaN(chips)) { setSizingBB(chips / bigBlind); setTypedText(fmtSize(chips / bigBlind)); }
      else setTypedText(fmtSize(sizingBB));
    }
    setSizeUnit(u);
  };

  const effectiveSizing = (() => {
    if (!typedText) return sizingBB;
    const n = parseFloat(typedText);
    if (isNaN(n)) return sizingBB;
    return sizeUnit === 'Chips' && bigBlind > 0 ? n / bigBlind : n;
  })();

  const updateSizing = (bb: number) => { setSizingBB(bb); onSizingChange?.(bb); };

  // Tapping a preset or typing a size only selects/highlights it — Confirm
  // is the one action that actually commits the raise/bet.
  const commitSize = (rawSizeBB: number) => {
    const sz = Math.max(1, fullStack > 0 ? Math.min(fullStack, rawSizeBB) : rawSizeBB);
    onConfirm(raiseAction, sz);
    setShowSizing(false); setTypedText('');
    onSizingChange?.(null);
  };

  const displaySizing = fmtDualAmount(effectiveSizing, { stackUnit: sizeUnit, bigBlind, gameType });

  const quickCommit = (a: AnyAction) => {
    let sz = 0;
    if (a === 'call')  sz = investedBB + Math.min(fullStack > 0 ? fullStack : callAmt, callAmt);
    if (a === 'allin') sz = investedBB + fullStack;
    onConfirm(a, sz);
  };

  const effPot = currentBetBB > 0 ? potBB + callAmt : potBB;
  const preflopPresets = (currentBetBB > 0 ? [2, 2.5, 3, 3.5, 4] : [2, 3, 4, 5, 6])
    .map(m => ({
      label: currentBetBB > 0 ? `${m}×` : `${m}BB`,
      sizeBB: currentBetBB > 0 ? Math.round(currentBetBB * m * 10) / 10 : m,
    }))
    .filter(p => p.sizeBB >= (minRaiseBB || 1) && (fullStack <= 0 || p.sizeBB <= fullStack));

  const postflopPresets = currentBetBB > 0
    ? [2, 2.5, 3, 4]
        .map(m => ({
          label: `${m}×`,
          sizeBB: Math.max(minRaiseBB || 1, Math.round(currentBetBB * m * 10) / 10),
        }))
        .filter(p => fullStack <= 0 || p.sizeBB <= fullStack)
    : [
        { label: '¼', frac: 0.25 }, { label: '⅓', frac: 0.33 },
        { label: '½', frac: 0.50 }, { label: '⅔', frac: 0.67 },
        { label: '¾', frac: 0.75 }, { label: 'Pot', frac: 1.00 },
      ].map(p => ({ label: p.label, sizeBB: Math.max(1, Math.round(effPot * p.frac * 2) / 2) }))
       .filter(p => fullStack <= 0 || p.sizeBB <= fullStack);

  const presets   = isPreflop ? preflopPresets : postflopPresets;
  const raiseLabel= isPreflop || currentBetBB > 0 ? 'Raise' : 'Bet';
  const actorName = isHero ? (heroName ?? 'Hero') : isVillain ? (villainName ?? `Villain ${vi + 1}`) : posLabel;
  // Whose turn it is needs to read at a glance — a clear, colour-coded
  // label (green for Hero, the villain's own accent — red for Villain 1 —
  // otherwise) right above the action buttons, but just a label, not a
  // filled banner competing with the buttons below it for attention.
  const turnLabel = `${actorName} (${posLabel})`;
  const preBtn = (a: AnyAction) => preSelectedAction === a ? { borderWidth: 2, borderColor: accent } : {};

  return (
    <View style={[styles.actionInput, { borderColor: accent }]}>
      <Text style={[styles.turnLabel, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{turnLabel}</Text>

      <View style={styles.actionBtnsRow}>
        <Pressable onPress={() => quickCommit('fold')}
          style={({ pressed }) => [styles.actionBtn, { borderColor: '#C04040', backgroundColor: pressed ? '#C04040' : '#FEE8E8' }, preBtn('fold')]}>
          <Text style={[styles.actionBtnText, { color: '#C04040' }]}>Fold</Text>
        </Pressable>

        {callAmt <= 0
          ? <Pressable onPress={() => quickCommit('check')}
              style={({ pressed }) => [styles.actionBtn, { borderColor: '#2E7D52' }, pressed && { backgroundColor: '#2E7D52' }, preBtn('check')]}>
              <Text style={styles.actionBtnText}>Check</Text>
            </Pressable>
          : <Pressable onPress={() => quickCommit('call')}
              style={({ pressed }) => [styles.actionBtn, { borderColor: '#2E7D52' }, pressed && { backgroundColor: '#2E7D52' }, preBtn('call')]}>
              <Text style={styles.actionBtnText}>
                {/* Compact button — no room for the "(BB)" bracket, but
                    still never a raw ≥1000 number. */}
                {isCallAllin
                  ? `Call All-In ${sizeUnit === 'Chips' && bigBlind > 0 ? fmtCompact(fullStack * bigBlind) : `${fmtSize(fullStack)}BB`}`
                  : `Call ${sizeUnit === 'Chips' && bigBlind > 0 ? fmtCompact(callAmt * bigBlind) : `${fmtSize(callAmt)}BB`}`}
              </Text>
            </Pressable>
        }

        {canRaise && (
          <Pressable onPress={openSizing}
            style={({ pressed }) => [styles.actionBtn, { borderColor: accent }, showSizing && { backgroundColor: accent }, pressed && { opacity: 0.75 }, preBtn('raise'), preBtn('bet')]}>
            <Text style={[styles.actionBtnText, showSizing && { color: '#fff' }]}>{raiseLabel}</Text>
          </Pressable>
        )}

        <Pressable onPress={() => quickCommit('allin')}
          style={({ pressed }) => [styles.actionBtn, { borderColor: '#C04040' }, pressed && { backgroundColor: '#C04040' }, preBtn('allin')]}>
          <Text style={styles.actionBtnText}>All-In</Text>
        </Pressable>
      </View>

      {showSizing && (
        <View style={{ gap: 8, marginTop: 2 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {presets.map(({ label, sizeBB }) => {
              // Compact chip button — no room for the "(BB)" bracket, but
              // still never a raw ≥1000 number.
              const dispAmt = sizeUnit === 'Chips' && bigBlind > 0 ? fmtCompact(sizeBB * bigBlind) : `${fmtSize(sizeBB)}BB`;
              const isActive = !typedText && Math.abs(sizingBB - sizeBB) < 0.05;
              return (
                <Pressable key={label} onPress={() => { updateSizing(sizeBB); setTypedText(''); }}
                  style={[styles.sizeChip, isActive && { backgroundColor: accent }]}>
                  <Text style={[styles.sizeChipLabel, isActive && { color: '#fff' }]}>{label}</Text>
                  <Text style={[styles.sizeChipAmt, isActive && { color: 'rgba(255,255,255,0.8)' }]}>{dispAmt}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              value={sizeFieldFocused ? typedText : (sizeUnit === 'Chips' && bigBlind > 0 ? fmtSize(sizingBB * bigBlind) : fmtSize(sizingBB))}
              onChangeText={(t) => {
                setTypedText(t);
                const n = parseFloat(t);
                if (!isNaN(n)) {
                  const bb = sizeUnit === 'Chips' && bigBlind > 0 ? n / bigBlind : n;
                  setSizingBB(bb); onSizingChange?.(bb);
                }
              }}
              onFocus={() => {
                setSizeFieldFocused(true);
                setTypedText(sizeUnit === 'Chips' && bigBlind > 0 ? fmtSize(sizingBB * bigBlind) : fmtSize(sizingBB));
              }}
              onBlur={() => {
                setSizeFieldFocused(false);
                if (typedText !== '') {
                  const n = parseFloat(typedText);
                  if (!isNaN(n)) {
                    const bb = sizeUnit === 'Chips' && bigBlind > 0 ? n / bigBlind : n;
                    const capped = fullStack > 0 ? Math.max(1, Math.min(fullStack, bb)) : Math.max(1, bb);
                    setSizingBB(capped); onSizingChange?.(capped);
                  }
                }
                setTypedText('');
              }}
              keyboardType="numeric" selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <UnitToggle unit={sizeUnit} onPress={handleUnit} accent={accent} />
          </View>

          <Pressable onPress={() => commitSize(effectiveSizing)}
            style={({ pressed }) => [styles.confirmBtn, { backgroundColor: accent }, pressed && { opacity: 0.8 }]}>
            <Text style={styles.confirmBtnText}>Confirm {raiseAction === 'raise' ? '↑ Raise' : 'Bet'} {displaySizing}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Header (one screen per step, with a title + back button) ──────────────────

const TOTAL_STEPS = 10;
const STEP_TITLES: Record<number, string> = {
  1: 'Game Type', 2: 'Blinds & Stack', 3: 'Positions', 4: 'Hole Cards', 5: 'Preflop',
  6: 'Flop', 7: 'Turn', 8: 'River', 9: 'Result', 10: 'Tag & Save',
};

function StepHeader({ step, onBack, onClose }: { step: number; onBack: () => void; onClose: () => void }) {
  // Step 1 has no Back button (it's the first screen) and its title is the
  // screen's own big heading, not a small nav-bar caption — so instead of
  // the centered title + reserved-but-empty back-button slot every other
  // step uses, it gets the plain left-title/right-action row every other
  // screen in the app uses (see Hands tab's own header for the same shape).
  if (step === 1) {
    return (
      <View style={styles.header}>
        <View style={styles.headerRowFlat}>
          <Text style={styles.headerTitleLarge}>{STEP_TITLES[1]}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>
          {step > 1 && (
            <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
              <Text style={styles.backIcon}>‹</Text>
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.headerTitle}>{STEP_TITLES[step] ?? ''}</Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Was a per-step ScrollView back when each step was its own full screen.
// Now every section shares one scrolling container (see LogHandModal), so
// this is just the section's inner padding/gap — kept as its own component
// only to avoid touching every call site below.
function StepScroll({ children }: { children: ReactNode }) {
  return <View style={styles.sectionBody}>{children}</View>;
}

interface StepProps { draft: HandDraft; set: (u: Partial<HandDraft>) => void; onNext: () => void; }

// ── Step 1: Game Type ─────────────────────────────────────────────────────────

// Reserved space below the cards for the Continue button — it's ALWAYS
// occupied (the button just fades/slides in or out inside it), so the cards
// above never resize depending on whether a selection has been made.
const GAME_TYPE_CONTINUE_SLOT = 52;
const GAME_TYPE_GAP = 16;

// One Cash/Tournament card — press-scale feedback plus a 150ms cross-fade
// into the green fill when selected, instead of an instant color snap.
// Same split as Chip above: the native-driven press scale lives on an outer
// wrapper, the JS-driven color fill on the inner Pressable — mixing the two
// drivers in one style object is what threw "Attempting to run JS driver
// animation on animated node that has been moved to native" when a card
// was selected. `styles.gameTypeBtn` (including its flex: 1) moves to the
// inner element; the outer wrapper just needs flex: 1 too so it still
// claims its half of the row.
function GameTypeCard({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const fill = useFillAnim(selected);
  const backgroundColor = fill.interpolate({ inputRange: [0, 1], outputRange: [C.background, HERO_COLOR] });
  const textColor       = fill.interpolate({ inputRange: [0, 1], outputRange: [C.text, C.tintText] });
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <AnimatedPressableBase
        onPressIn={() => { onSelect(); onPressIn(); }}
        onPressOut={onPressOut}
        style={[styles.gameTypeBtn, { backgroundColor }]}>
        <Animated.Text style={[styles.gameTypeBtnText, { color: textColor }]}>{label}</Animated.Text>
      </AnimatedPressableBase>
    </Animated.View>
  );
}

// Full-screen picker — two large, identically-bordered cards filling almost
// the whole screen. Tapping a card selects it (and can be changed by
// tapping the other one); Continue is what actually commits and advances.
function StepGameType({ set, onNext }: StepProps) {
  const { height } = useWindowDimensions();
  const [selected, setSelected] = useState<'cash' | 'tournament' | null>(null);
  const [advancing, setAdvancing] = useState(false);
  // The screen fade IS the transition — plays once Continue is pressed, so
  // it reads as "moving to the next screen" rather than a button effect.
  const screenFade = useRef(new Animated.Value(1)).current;
  const continueAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(continueAnim, {
      toValue: selected ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [selected, continueAnim]);

  const handleContinue = () => {
    if (!selected || advancing) return;
    setAdvancing(true);
    if (selected === 'cash') {
      set({ gameType: 'cash', stackUnit: '$', bigBlind: INITIAL_DRAFT.cashBB, smallBlind: INITIAL_DRAFT.cashSB });
    } else {
      set({ gameType: 'tournament', stackUnit: 'Chips', bigBlind: INITIAL_DRAFT.tournamentBB, smallBlind: INITIAL_DRAFT.tournamentSB });
    }
    Animated.timing(screenFade, { toValue: 0, duration: 230, easing: Easing.out(Easing.ease), useNativeDriver: true })
      .start(() => onNext());
  };

  // Fixed height, not flex:1 — the cards row's size depends only on the
  // screen height, never on whether the Continue slot below it currently
  // has anything visible in it.
  const totalHeight = Math.max(460, height * 0.7);
  const cardsHeight = totalHeight - GAME_TYPE_GAP - GAME_TYPE_CONTINUE_SLOT;

  return (
    <Animated.View style={[styles.gameTypeRoot, { minHeight: totalHeight, opacity: screenFade }]}>
      <View style={[styles.gameTypeScreen, { height: cardsHeight }]}>
        <GameTypeCard label="Cash Game" selected={selected === 'cash'} onSelect={() => setSelected('cash')} />
        <GameTypeCard label="Tournament" selected={selected === 'tournament'} onSelect={() => setSelected('tournament')} />
      </View>
      <View style={[styles.gameTypeContinueSlot, { height: GAME_TYPE_CONTINUE_SLOT }]} pointerEvents={selected ? 'auto' : 'none'}>
        <Animated.View style={{
          opacity: continueAnim,
          transform: [{ translateY: continueAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}>
          <NextBtn onPress={handleContinue} disabled={!selected || advancing} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ── Step 2: Blinds & Stack ─────────────────────────────────────────────────────

const CASH_PRESETS = [
  { label: '$1/$2', sb: 1, bb: 2 }, { label: '$1/$3', sb: 1, bb: 3 },
  { label: '$2/$5', sb: 2, bb: 5 }, { label: '$5/$10', sb: 5, bb: 10 },
];

const AnimatedPath = Animated.createAnimatedComponent(Path);
const INTRO_DRAW_MS = 500;
const INTRO_DRAW_STROKE = 2.5;
const INTRO_DRAW_RADIUS = 12;

// An explicit path (rather than a <Rect rx=.../>, whose corner-rounding
// implementation — and therefore its implicit start point/winding — isn't
// guaranteed consistent across react-native-svg's iOS/Android renderers) so
// the draw is guaranteed to start at the top-left corner and trace clockwise:
// right across the top, down the right side, left across the bottom, up the
// left side, closing back at the top-left corner.
function topLeftClockwiseRectPath(x: number, y: number, w: number, h: number, r: number) {
  return `M ${x + r},${y} H ${x + w - r} A ${r},${r} 0 0 1 ${x + w},${y + r} V ${y + h - r} A ${r},${r} 0 0 1 ${x + w - r},${y + h} H ${x + r} A ${r},${r} 0 0 1 ${x},${y + h - r} V ${y + r} A ${r},${r} 0 0 1 ${x + r},${y} Z`;
}

// Wraps one input group with the static "this is the active section"
// outline — same solid-border-plus-tint treatment as the Position screen's
// Hero/Villain selectors, moving between groups instead of between two
// fixed selectors. No continuous animation.
//
// `introDraw`, when true, replaces that static border for its first
// appearance with a pen-drawing effect: an SVG path stroke traced clockwise
// from the top-left corner via strokeDashoffset, over INTRO_DRAW_MS. Once
// the stroke completes, the SVG unmounts and the plain CSS border (already
// governed by `active`) takes over — no looping, drawn once per mount.
function HighlightGroup({ active, children, introDraw }: { active: boolean; children: ReactNode; introDraw?: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [drawing, setDrawing] = useState(!!introDraw);
  const draw = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!introDraw) return;
    Animated.timing(draw, { toValue: 1, duration: INTRO_DRAW_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: false })
      .start(() => setDrawing(false));
    // Intentionally empty deps — this is a one-shot "screen just loaded" cue,
    // not something that should replay on later re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const w = Math.max(size.width - INTRO_DRAW_STROKE, 0);
  const h = Math.max(size.height - INTRO_DRAW_STROKE, 0);
  const r = Math.min(INTRO_DRAW_RADIUS, w / 2, h / 2);
  // Perimeter = the four straight edges (each shortened by the two corner
  // radii it meets) plus the four corner arcs, which together make one full
  // circle of radius r.
  const perimeter = Math.max(2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r, 0);
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [perimeter, 0] });
  const d = topLeftClockwiseRectPath(INTRO_DRAW_STROKE / 2, INTRO_DRAW_STROKE / 2, w, h, r);

  return (
    <View style={[styles.highlightWrap, sectionHighlightStyle(active && !drawing)]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {children}
      {drawing && size.width > 0 && (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject} width={size.width} height={size.height}>
          <AnimatedPath
            d={d} fill="none" stroke={HERO_COLOR} strokeWidth={INTRO_DRAW_STROKE} strokeLinecap="round"
            strokeDasharray={`${perimeter}, ${perimeter}`}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      )}
    </View>
  );
}

// A pill-shaped "Confirm" button styled to match the app (dark green fill,
// cream text) rather than a bare default-looking iOS toolbar link — sitting
// right-aligned in a keyboard accessory bar above the numeric pad.
function ConfirmKeyboardAccessory({ nativeID, disabled, onPress }: { nativeID: string; disabled: boolean; onPress: () => void }) {
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.kbToolbar}>
        <Pressable onPress={onPress} disabled={disabled} hitSlop={8}
          style={({ pressed }) => [styles.kbToolbarBtn, disabled && styles.kbToolbarBtnOff, pressed && !disabled && styles.kbToolbarBtnPressed]}>
          <Text style={[styles.kbToolbarText, disabled && styles.kbToolbarTextOff]}>Confirm</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

function StepBlinds({ draft, set, onNext, onFieldFocus }: StepProps & { onFieldFocus?: () => void }) {
  const isCash = draft.gameType === 'cash';
  const [stackUnit, setStackUnit] = useState<'BB' | 'Chips'>('BB');
  const [stackText, setStackText] = useState('');
  const stackFocused = useRef(false);

  // The highlight walks 1 Players → 2 Blinds/Stakes → 3 Ante/Straddle →
  // 4 Effective Stack, then 5 (nowhere — all done). HandDraft's defaults are
  // already non-zero (playerCount 6, blinds 100/200, etc.), so "does this
  // field have a value" can't signal completion the way it does elsewhere in
  // the flow — each group only advances once the user actually acts on it.
  // Re-mounting this step (jumping back to edit, or reopening a saved hand)
  // shouldn't replay the walk-through — draft.blindsStepSeen (or having
  // reached any later street, for hands saved before that field existed) is
  // what tells the two cases apart.
  const alreadySeen = draft.blindsStepSeen || draft.preflopComplete
    || draft.flopComplete || draft.turnComplete || draft.riverComplete;
  const [highlightStep, setHighlightStep] = useState(alreadySeen ? 5 : 1);
  const advance = (n: number) => {
    setHighlightStep(s => Math.max(s, n));
    if (n >= 5) set({ blindsStepSeen: true });
  };

  // Players and Ante both default to a non-empty HandDraft value
  // (playerCount 6, anteType 'none') that would otherwise show a chip as
  // pre-selected before the user has actually tapped anything. These flip
  // true only on an explicit tap, so a fresh hand starts with every chip in
  // both rows unselected; reopening an already-completed hand starts both
  // true so the real saved selection displays correctly.
  const [playersChosen, setPlayersChosen] = useState(alreadySeen);
  const [anteChosen, setAnteChosen] = useState(alreadySeen);
  // Confirming the Blind Level lives entirely in the keyboard's accessory
  // toolbar (see ConfirmKeyboardAccessory above) instead of an inline
  // button, so it never occupies screen space of its own — it only exists
  // while the SB/BB keyboard is up, and "tapping back in" to either field to
  // edit an already-confirmed value re-opens that same keyboard/toolbar for
  // free.
  const confirmBlinds = () => { Keyboard.dismiss(); advance(3); };

  const getDisplayStack = () => {
    if (stackFocused.current) return stackText;
    if (draft.effectiveStack <= 0) return '';
    return stackUnit === 'Chips' && draft.bigBlind > 0
      ? fmtSize(draft.effectiveStack * draft.bigBlind)
      : fmtSize(draft.effectiveStack);
  };

  const commitStack = (text: string, unit: 'BB' | 'Chips') => {
    const n = parseFloat(text);
    if (!isNaN(n) && n > 0) {
      const bb = unit === 'Chips' && draft.bigBlind > 0 ? n / draft.bigBlind : n;
      set({ effectiveStack: bb, effectiveStackBB: bb, stackUnit: unit });
    }
  };

  const handleUnitChange = (u: 'BB' | 'Chips') => {
    const newText = u === 'Chips' && draft.bigBlind > 0
      ? fmtSize(draft.effectiveStack * draft.bigBlind)
      : fmtSize(draft.effectiveStack);
    setStackText(newText);
    setStackUnit(u);
    set({ stackUnit: u });
  };

  const stackNote = () => {
    if (draft.effectiveStack <= 0 || draft.bigBlind <= 0) return '';
    const raw = draft.effectiveStack * draft.bigBlind;
    return stackUnit === 'BB'
      ? `= ${isCash ? `$${fmtCompact(raw)}` : fmtCompact(raw)}`
      : `= ${fmtSize(draft.effectiveStack)}BB`;
  };

  const isOther = isCash && !CASH_PRESETS.find(p => p.label === draft.stakes);

  return (
    <StepScroll>
      <HighlightGroup active={highlightStep === 1} introDraw={!alreadySeen}>
        <Label text="Players at table" />
        <View style={styles.chipRow}>
          {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <Chip key={n} label={String(n)} active={playersChosen && draft.playerCount === n}
              onPress={() => { set({ playerCount: n }); setPlayersChosen(true); advance(2); }} />
          ))}
        </View>
      </HighlightGroup>

      {isCash ? (
        <HighlightGroup active={highlightStep === 2}>
          <Label text="Stakes" />
          <View style={styles.chipRow}>
            {CASH_PRESETS.map(({ label, sb, bb }) => (
              <Chip key={label} label={label} active={draft.stakes === label}
                onPress={() => { set({ stakes: label, cashSB: sb, cashBB: bb, bigBlind: bb, smallBlind: sb }); advance(3); }} />
            ))}
            <Chip label="Other" active={isOther} onPress={() => set({ stakes: 'other' })} />
          </View>
          {isOther && (
            <View style={styles.twoCol}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Small Blind ($)</Text>
                <View style={styles.numRow}>
                  <BufferedNumInput
                    displayValue={draft.cashSB > 0 ? String(draft.cashSB) : ''}
                    // Auto-fill the Big Blind at double the Small Blind — it's
                    // still its own independent field the user can overwrite.
                    onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ cashSB: n, smallBlind: n, cashBB: n * 2, bigBlind: n * 2 }); }}
                    onBlurCommit={() => { if (draft.cashSB > 0 && draft.cashBB > 0) advance(3); }}
                    onFocusInput={onFieldFocus}
                    placeholder="1" />
                </View>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Big Blind ($)</Text>
                <View style={styles.numRow}>
                  <BufferedNumInput
                    displayValue={draft.cashBB > 0 ? String(draft.cashBB) : ''}
                    onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ cashBB: n, bigBlind: n }); }}
                    onBlurCommit={() => { if (draft.cashSB > 0 && draft.cashBB > 0) advance(3); }}
                    onFocusInput={onFieldFocus}
                    placeholder="2" />
                </View>
              </View>
            </View>
          )}
        </HighlightGroup>
      ) : (
        <HighlightGroup active={highlightStep === 2}>
          <Label text="Blind level" />
          <View style={styles.twoCol}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.fieldLabel}>Small Blind</Text>
              <View style={styles.numRow}>
                <BufferedNumInput
                  displayValue={draft.tournamentSB > 0 ? String(draft.tournamentSB) : ''}
                  // Auto-fill the Big Blind at double the Small Blind — it's
                  // still its own independent field the user can overwrite.
                  onChangeText={(t) => {
                    const n = parseFloat(t);
                    if (!isNaN(n)) set({ tournamentSB: n, smallBlind: n, tournamentBB: n * 2, bigBlind: n * 2, stakes: `${n}/${n * 2}` });
                  }}
                  onSubmit={confirmBlinds}
                  inputAccessoryViewID={Platform.OS === 'ios' ? BLINDS_SB_ACCESSORY_ID : undefined}
                  onFocusInput={onFieldFocus}
                  placeholder="100" />
              </View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.fieldLabel}>Big Blind</Text>
              <View style={styles.numRow}>
                <BufferedNumInput
                  displayValue={draft.tournamentBB > 0 ? String(draft.tournamentBB) : ''}
                  onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ tournamentBB: n, bigBlind: n, stakes: `${draft.tournamentSB}/${n}` }); }}
                  onSubmit={confirmBlinds}
                  inputAccessoryViewID={Platform.OS === 'ios' ? BLINDS_BB_ACCESSORY_ID : undefined}
                  onFocusInput={onFieldFocus}
                  placeholder="200" />
              </View>
            </View>
          </View>
          {Platform.OS === 'ios' && (
            <>
              <ConfirmKeyboardAccessory nativeID={BLINDS_SB_ACCESSORY_ID}
                disabled={!(draft.tournamentSB > 0 && draft.tournamentBB > 0)} onPress={confirmBlinds} />
              <ConfirmKeyboardAccessory nativeID={BLINDS_BB_ACCESSORY_ID}
                disabled={!(draft.tournamentSB > 0 && draft.tournamentBB > 0)} onPress={confirmBlinds} />
            </>
          )}
        </HighlightGroup>
      )}

      <HighlightGroup active={highlightStep === 3}>
        {isCash ? (
          <>
            <Label text="Straddle" />
            <View style={styles.chipRow}>
              <Chip label="No Straddle" active={!draft.straddleEnabled}
                onPress={() => { set({ straddleEnabled: false, straddleAmount: 0 }); advance(4); }} />
              <Chip label="Straddle 2×" active={draft.straddleEnabled}
                onPress={() => { set({ straddleEnabled: true, straddleAmount: draft.bigBlind * 2 }); advance(4); }} />
            </View>
          </>
        ) : (
          <>
            <Label text="Ante" />
            <View style={styles.chipRow}>
              {([['none', 'No Ante'], ['bbAnte', 'BB Ante'], ['ante', 'Ante']] as [AnteType, string][]).map(([key, lbl]) => (
                <Chip key={key} label={lbl} active={anteChosen && draft.anteType === key}
                  onPress={() => {
                    set({ anteType: key, anteAmount: key === 'bbAnte' ? draft.tournamentBB : key === 'none' ? 0 : draft.anteAmount });
                    setAnteChosen(true);
                    // No Ante / BB Ante need nothing further from the user —
                    // advance right away. Ante needs the amount typed in
                    // first, so the highlight waits for that field's blur.
                    if (key !== 'ante') advance(4);
                  }} />
              ))}
            </View>
            {draft.anteType === 'ante' && (
              <View style={{ gap: 4 }}>
                <Text style={styles.fieldLabel}>Ante amount</Text>
                <View style={styles.numRow}>
                  <BufferedNumInput
                    displayValue={draft.anteAmount > 0 ? String(draft.anteAmount) : ''}
                    onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ anteAmount: n }); }}
                    onBlurCommit={() => { if (draft.anteAmount > 0) advance(4); }}
                    placeholder="25" />
                </View>
              </View>
            )}
          </>
        )}
      </HighlightGroup>

      <HighlightGroup active={highlightStep === 4}>
        <Label text="Effective stack" />
        <View style={styles.numRow}>
          <TextInput
            style={styles.numInput}
            keyboardType="numeric"
            selectTextOnFocus
            value={getDisplayStack()}
            onFocus={() => { stackFocused.current = true; setStackText(getDisplayStack()); }}
            onChangeText={(t) => {
              setStackText(t);
              const n = parseFloat(t);
              if (!isNaN(n) && n > 0) {
                const bb = stackUnit === 'Chips' && draft.bigBlind > 0 ? n / draft.bigBlind : n;
                set({ effectiveStack: bb, effectiveStackBB: bb });
              }
            }}
            onBlur={() => { stackFocused.current = false; commitStack(stackText, stackUnit); advance(5); }}
            placeholder={stackUnit === 'BB' ? '100' : String(Math.round((draft.bigBlind || 2) * 100))}
            placeholderTextColor={C.textSecondary}
          />
          <UnitToggle unit={stackUnit} onPress={handleUnitChange} />
        </View>
        {stackNote() ? <Text style={styles.stackNote}>{stackNote()}</Text> : null}
      </HighlightGroup>

      <NextBtn onPress={onNext} disabled={draft.bigBlind <= 0 || draft.effectiveStack <= 0} />
    </StepScroll>
  );
}

// ── Step 2: Position ──────────────────────────────────────────────────────────

function StepPosition({ draft, set, onNext }: StepProps) {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  // Hero mode selected by default so table is immediately interactive
  const [mode, setMode] = useState<'hero' | `villain${number}` | null>('hero');
  const [vStackUnit, setVStackUnit] = useState<'BB' | 'Chips'>('BB');

  // A hand always has an opponent — seed one unselected villain slot so the
  // Villain box is on screen from the start, not just after "+ Add Villain".
  useEffect(() => {
    if (draft.villainSeats.length === 0) set({ villainSeats: [-1] });
  }, []);

  // Continue is always pressable (never greyed out) — pressing it with a
  // seat missing doesn't navigate, it just makes the gap impossible to miss:
  // a short vibration plus 3 quick pulses of the missing box's border. No
  // error text needed on top of that.
  const heroPulse    = useRef(new Animated.Value(0)).current;
  const villainPulse = useRef(new Animated.Value(0)).current;
  const pulse = (val: Animated.Value) => {
    val.setValue(0);
    Animated.sequence([
      Animated.timing(val, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.timing(val, { toValue: 0, duration: 110, useNativeDriver: true }),
      Animated.timing(val, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.timing(val, { toValue: 0, duration: 110, useNativeDriver: true }),
      Animated.timing(val, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.timing(val, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const handleContinue = () => {
    const heroMissing    = draft.heroSeat === null;
    const villainMissing = !draft.villainSeats.some(s => s >= 0);
    if (!heroMissing && !villainMissing) { onNext(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (heroMissing) pulse(heroPulse);
    if (villainMissing) pulse(villainPulse);
  };

  // Each villain's name/stack is keyed by its CURRENT position in
  // villainSeats ('villain1' = index 0, etc.), not a stable per-villain id —
  // so whenever a villain slot is removed from the middle of the array
  // (explicit remove, or Hero's seat bumping a villain out), everything
  // after it has to be re-keyed down one slot too. Skipping this is exactly
  // what makes one villain's name appear to "jump" onto another villain
  // after a removal — the data was never touched, just left under its old
  // (now wrong) index.
  const reindexAfterRemove = <T,>(map: Record<string, T>, removedIdx: number, count: number): Record<string, T> => {
    const out: Record<string, T> = {};
    for (let i = 0; i < count; i++) {
      if (i === removedIdx) continue;
      const oldKey = `villain${i + 1}`;
      if (!(oldKey in map)) continue;
      const newKey = i < removedIdx ? oldKey : `villain${i}`;
      out[newKey] = map[oldKey];
    }
    return out;
  };

  const handleSeat = (seatIdx: number) => {
    if (!mode) return;
    if (mode === 'hero') {
      const bumpedIdx = draft.villainSeats.indexOf(seatIdx);
      if (bumpedIdx === -1) {
        set({ heroSeat: seatIdx });
      } else {
        const count = draft.villainSeats.length;
        set({
          heroSeat: seatIdx,
          villainSeats: draft.villainSeats.filter(s => s !== seatIdx),
          villainStacksBB: reindexAfterRemove(draft.villainStacksBB, bumpedIdx, count),
          villainNames: reindexAfterRemove(draft.villainNames, bumpedIdx, count),
        });
      }
      // Seamless flow: arm Villain 1 immediately so the very next table tap
      // places the villain — no need to manually tap the Villain 1 box first.
      setMode('villain0');
    } else {
      const vi = parseInt(mode.replace('villain', ''), 10);
      if (seatIdx === draft.heroSeat) return;
      const next = [...draft.villainSeats];
      while (next.length <= vi) next.push(-1);
      next[vi] = seatIdx;
      set({ villainSeats: next.filter(s => s >= 0) });
    }
    // Keep mode active so user can keep tapping seats to reposition
  };

  // Active-selection accent — drives the glow on the selector box and the
  // highlight ring on the table so it's obvious who the next tap assigns.
  const activeAccent = mode === 'hero'
    ? HERO_COLOR
    : mode
    ? (VILLAIN_COLORS[parseInt(mode.replace('villain', ''), 10)] ?? VILLAIN_COLORS[0])
    : null;

  const glowStyle = (color: string, active: boolean) => !active ? {} : {
    borderColor: color,
    backgroundColor: color + '14',
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  };

  const addVillain = () => {
    const idx = draft.villainSeats.length;
    set({ villainSeats: [...draft.villainSeats, -1] });
    setMode(`villain${idx}` as `villain${number}`);
  };

  const removeVillain = (i: number) => {
    // There must always be at least one villain box on screen.
    if (draft.villainSeats.length <= 1) return;
    const count = draft.villainSeats.length;
    set({
      villainSeats: draft.villainSeats.filter((_, idx) => idx !== i),
      villainStacksBB: reindexAfterRemove(draft.villainStacksBB, i, count),
      villainNames: reindexAfterRemove(draft.villainNames, i, count),
    });
    if (mode === `villain${i}`) setMode(null);
  };

  const summaryParts = [
    draft.heroSeat !== null ? labels[draft.heroSeat] : null,
    ...draft.villainSeats.filter(s => s >= 0).map(s => labels[s] ?? '?'),
  ].filter(Boolean);

  return (
    <StepScroll>
      <View style={{ alignItems: 'center' }}>
        <TableDiagram playerCount={draft.playerCount} heroSeat={draft.heroSeat}
          villainSeats={draft.villainSeats.filter(s => s >= 0)} onSeatPress={handleSeat}
          highlightEmptySeats={mode !== null} highlightColor={activeAccent ?? undefined} />
        {mode !== null && (
          <Text style={[styles.tableInstruction, { color: activeAccent ?? C.textSecondary }]}>
            {mode === 'hero' ? 'Tap a seat for Hero' : 'Tap a seat for Villain'}
          </Text>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Pressable onPress={() => setMode(mode === 'hero' ? null : 'hero')}
          style={[styles.selectorBtn, glowStyle(HERO_COLOR, mode === 'hero')]}>
          <View style={[styles.selectorDot, { backgroundColor: HERO_COLOR }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.selectorTitle, { color: HERO_COLOR }]}>{heroLabel(draft.heroName)}</Text>
            <Text style={styles.selectorSeat}>{draft.heroSeat !== null ? labels[draft.heroSeat] ?? '?' : 'Tap to select seat'}</Text>
          </View>
          <Text style={[styles.selectorArrow, mode === 'hero' && { color: HERO_COLOR }]}>{mode === 'hero' ? '▲' : '›'}</Text>
          <Animated.View pointerEvents="none" style={[styles.pulseOverlay, { opacity: heroPulse }]} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
          <Text style={styles.vstackLabel}>Name</Text>
          <TextInput style={styles.villainNameInput}
            value={draft.heroName}
            onChangeText={(t) => set({ heroName: t })}
            placeholder="Hero (optional)" placeholderTextColor={C.textSecondary}
            maxLength={20} returnKeyType="done" />
        </View>

        {draft.villainSeats.map((seat, i) => {
          const isActive = mode === `villain${i}`;
          const color    = VILLAIN_COLORS[i] ?? VILLAIN_COLORS[0];
          const vKey     = `villain${i + 1}`;
          const stackBB  = draft.villainStacksBB[vKey] ?? 0;
          const dispStack = vStackUnit === 'Chips' && draft.bigBlind > 0 ? fmtSize(stackBB * draft.bigBlind) : fmtSize(stackBB);
          return (
            <View key={i} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable onPress={() => setMode(isActive ? null : `villain${i}` as `villain${number}`)}
                  style={[styles.selectorBtn, { flex: 1 }, glowStyle(color, isActive)]}>
                  <View style={[styles.selectorDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.selectorTitle, { color }]}>{villainLabel(vKey, draft.villainNames)}</Text>
                    <Text style={styles.selectorSeat}>{seat >= 0 ? (labels[seat] ?? '?') : 'Tap to select seat'}</Text>
                  </View>
                  <Text style={[styles.selectorArrow, isActive && { color }]}>{isActive ? '▲' : '›'}</Text>
                  <Animated.View pointerEvents="none" style={[styles.pulseOverlay, { opacity: villainPulse }]} />
                </Pressable>
                {draft.villainSeats.length > 1 && (
                  <Pressable onPress={() => removeVillain(i)}
                    style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </Pressable>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                <Text style={styles.vstackLabel}>Name</Text>
                <TextInput style={styles.villainNameInput}
                  value={draft.villainNames[vKey] ?? ''}
                  onChangeText={(t) => set({ villainNames: { ...draft.villainNames, [vKey]: t } })}
                  placeholder={`Villain ${i + 1} (optional)`} placeholderTextColor={C.textSecondary}
                  maxLength={20} returnKeyType="done" />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                <Text style={styles.vstackLabel}>Stack</Text>
                <View style={[styles.numRow, { flex: 1 }]}>
                  <BufferedNumInput
                    displayValue={stackBB > 0 ? dispStack : ''}
                    onChangeText={(t) => {
                      const n = parseFloat(t);
                      if (!isNaN(n)) {
                        const bb = vStackUnit === 'Chips' && draft.bigBlind > 0 ? n / draft.bigBlind : n;
                        set({ villainStacksBB: { ...draft.villainStacksBB, [vKey]: bb } });
                      }
                    }}
                    placeholder={fmtSize(draft.effectiveStackBB || 100)} />
                  <UnitToggle unit={vStackUnit} onPress={setVStackUnit} accent={color} />
                </View>
              </View>
            </View>
          );
        })}

        {draft.villainSeats.length < 3 && (
          <Pressable onPress={addVillain} style={({ pressed }) => [styles.addVillainBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.addVillainText}>+ Add Villain</Text>
          </Pressable>
        )}
      </View>

      {summaryParts.length >= 2 && (
        <View style={styles.summaryBox}><Text style={styles.summaryText}>{summaryParts.join(' vs ')}</Text></View>
      )}
      <NextBtn onPress={handleContinue} />
    </StepScroll>
  );
}

// ── Step 4: Cards ─────────────────────────────────────────────────────────────

function StepCards({ draft, set, onNext, onSkip }: StepProps & { onSkip: () => void }) {
  const [slot, setSlot] = useState(0);
  const [pending, setPending] = useState<Rank | null>(null);

  const guardedSkip = () => {
    if (pending) { Alert.alert('Finish this card?', `You picked ${pending} but haven't chosen a suit yet.`, [
      { text: 'Keep picking', style: 'cancel' },
      { text: 'Skip anyway', style: 'destructive', onPress: onSkip },
    ]); return; }
    onSkip();
  };

  return (
    <StepScroll>
      <CardPicker cards={[draft.card1, draft.card2]} activeSlot={slot} onSlotPress={setSlot}
        onCardPicked={(i, c) => { if (i === 0) set({ card1: c }); else set({ card2: c }); }}
        onClear={(i) => i === 0 ? set({ card1: null }) : set({ card2: null })}
        onAllFilled={onNext}
        onPendingChange={setPending} />
      {/* Only needed if the user arrives here with both cards already picked
          (back navigation) — a fresh pick auto-advances via onAllFilled. */}
      {draft.card1 && draft.card2 && (
        <FadeSlideIn key="continue"><NextBtn onPress={onNext} label="Continue" /></FadeSlideIn>
      )}
      <SkipBtn onPress={guardedSkip} label="Skip — no card recording" />
    </StepScroll>
  );
}

// ── Step 5: Preflop ───────────────────────────────────────────────────────────

function StepPreflop({ draft, set, onNext, onFold, onEdit, onSizingOpen }: StepProps & { onFold: () => void; onEdit: () => void; onSizingOpen?: () => void }) {
  const labels     = POSITION_LABELS[draft.playerCount] ?? [];
  const sbInBB     = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradMul   = draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const heroStack  = draft.effectiveStackBB || draft.effectiveStack;
  const seatOrder  = getPreflopActingOrder(draft.playerCount);
  const actorOrder = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const initialInv = buildPreflopInvestments(actorOrder, sbInBB, stradMul, draft.playerCount);
  const namedActors = new Set(actorOrder.filter(a => a === 'hero' || a.startsWith('villain')));

  // Default selected tab to hero (first named actor)
  const defaultActor = actorOrder.find(a => namedActors.has(a)) ?? actorOrder[0] ?? 'hero';
  const [selectedActor, setSelectedActor] = useState(defaultActor);
  const [isEditing, setIsEditing] = useState(false);
  const [preSelectedAction, setPreSelectedAction] = useState<AnyAction | null>(null);
  // Persist sizing across tab switches
  const [perActorSizings, setPerActorSizings] = useState<Record<string, number>>({});
  // For pending-raise + tab-switch
  const pendingSizingRef = useRef<number | null>(null);

  // Auto-fold unnamed seats before the first named actor on mount
  useEffect(() => {
    if (draft.preflopActions.length === 0) {
      const firstNamedIdx = actorOrder.findIndex(a => namedActors.has(a));
      if (firstNamedIdx > 0) {
        const folds: ActionEntry[] = actorOrder.slice(0, firstNamedIdx)
          .map(a => ({ actor: a, action: 'fold' as AnyAction, sizingBB: 0 }));
        set({ preflopActions: folds });
      }
    }
  }, []);

  const state = computePreflopState(draft.preflopActions, sbInBB, stradMul, initialInv);
  const bettingDone = draft.heroFolded || isBettingComplete(actorOrder, state);
  // Hand is over once folds leave ≤1 named player standing (heads-up fold, or last
  // opponent folding in a multiway pot) — no further streets should be prompted.
  const activeNamedPreflop = [...namedActors].filter(a => !state.foldedActors.has(a));
  const foldEndsHand = state.foldedActors.size > 0 && activeNamedPreflop.length <= 1;

  // Compute the state selectedActor was FACING (before their last action, or current state if unacted)
  const stateForSelected = (() => {
    // If actor still owes chips (facing a raise they haven't called), use the current state
    // so call amount reflects the new bet, not the old one.
    const alreadyIn = state.investedBB[selectedActor] ?? 0;
    if (alreadyIn < state.currentBetBB) return state;
    // Actor has matched the current bet — show state before their last action for editing
    let lastActIdx = -1;
    for (let i = draft.preflopActions.length - 1; i >= 0; i--) {
      if (draft.preflopActions[i].actor === selectedActor) { lastActIdx = i; break; }
    }
    return lastActIdx >= 0
      ? computePreflopState(draft.preflopActions.slice(0, lastActIdx), sbInBB, stradMul, initialInv)
      : state;
  })();

  const posLabelAt  = (idx: number) => labels[seatOrder[idx]] ?? `S${seatOrder[idx] + 1}`;
  const posLabelFor = (actor: string) => { const i = actorOrder.indexOf(actor); return i >= 0 ? posLabelAt(i) : '?'; };
  const dotFor  = (a: string) => a === 'hero' ? HERO_COLOR : a.startsWith('villain') ? (VILLAIN_COLORS[parseInt(a.replace('villain',''),10)-1] ?? VILLAIN_COLORS[0]) : UNNAMED_COLOR;
  const nameFor = (a: string) => {
    if (a === 'hero') return `${heroLabel(draft.heroName)} · ${posLabelFor(a)}`;
    if (a.startsWith('villain')) return `${villainLabel(a, draft.villainNames)} · ${posLabelFor(a)}`;
    return posLabelFor(a);
  };
  const tabAccent = (a: string) => a === 'hero' ? HERO_COLOR : a.startsWith('villain') ? (parseInt(a.replace('villain',''),10)===1 ? '#C04040' : '#D4683A') : UNNAMED_COLOR;
  const stackFor  = (a: string) => {
    if (!a.startsWith('villain')) return heroStack;
    const vs = draft.villainStacksBB[a];
    return (vs && vs > 0) ? vs : heroStack;
  };

  // Next named actor that still needs to act: behind current bet or hasn't acted yet
  const findNextNamedActor = (fromActor: string, afterState: typeof state): string | null => {
    const curIdx = actorOrder.indexOf(fromActor);
    const n = actorOrder.length;
    for (let i = 1; i < n; i++) {
      const next = actorOrder[(curIdx + i) % n];
      if (
        namedActors.has(next) &&
        !afterState.foldedActors.has(next) &&
        !afterState.allInActors.has(next) &&
        ((afterState.investedBB[next] ?? 0) < afterState.currentBetBB || !afterState.hasActed.has(next))
      ) {
        return next;
      }
    }
    return null;
  };

  // Tab press — never reverts actions. Just switches view + shows last action highlighted.
  const handleTabPress = (actor: string) => {
    // If there's a pending raise, auto-confirm before switching
    const pendingSizing = pendingSizingRef.current;
    if (pendingSizing !== null) {
      pendingSizingRef.current = null;
      const raiseAct: AnyAction = stateForSelected.currentBetBB > 0 ? 'raise' : 'bet';
      doAction(raiseAct, pendingSizing);
    }
    // Show last committed action highlighted (purely informational)
    let lastActIdx = -1;
    for (let i = draft.preflopActions.length - 1; i >= 0; i--) {
      if (draft.preflopActions[i].actor === actor) { lastActIdx = i; break; }
    }
    setPreSelectedAction(lastActIdx >= 0 ? draft.preflopActions[lastActIdx].action : null);
    setSelectedActor(actor);
    if (bettingDone) setIsEditing(true);
  };

  const doAction = (action: AnyAction, sizingBB: number) => {
    const actor = selectedActor;
    setPreSelectedAction(null);
    setIsEditing(false);
    // Any preflop change invalidates whatever was already recorded for later
    // streets (pot size, who's still in) — no-op when nothing's there yet.
    onEdit();
    let newActs: ActionEntry[];

    // Find actor's last committed action
    let lastActIdx = -1;
    for (let i = draft.preflopActions.length - 1; i >= 0; i--) {
      if (draft.preflopActions[i].actor === actor) { lastActIdx = i; break; }
    }

    // Only replace in-place when no OTHER NAMED actor acted after them — a
    // trailing run of auto-folded unnamed seats (eagerly inserted below,
    // between this actor and whoever's next) doesn't count as "someone else
    // acted," so re-opening the sizing panel and confirming a different
    // amount for the SAME still-selected actor edits their one entry instead
    // of appending a second one for the same decision (which used to show as
    // two back-to-back lines for one action, e.g. "raises to 2BB" then
    // "raises to 3BB"). A genuine re-raise from another named actor still
    // correctly falls through to the append branch below.
    const isLastEntry = lastActIdx >= 0 &&
      !draft.preflopActions.slice(lastActIdx + 1).some(e => namedActors.has(e.actor));

    if (lastActIdx >= 0 && isLastEntry) {
      // Direct edit: replace in-place
      newActs = draft.preflopActions.map((e, i) =>
        i === lastActIdx ? { actor, action, sizingBB } : e
      );
    } else {
      // New action OR responding to a subsequent raise: keep existing history, append new.
      // Auto-fold unnamed seats that getNextActor says should move before this actor.
      let acts = [...draft.preflopActions];
      let st   = computePreflopState(acts, sbInBB, stradMul, initialInv);
      let next = getNextActor(actorOrder, st);
      let guard = 0;
      while (next && next !== actor && guard++ < 30) {
        if (namedActors.has(next)) break;
        acts = [...acts, { actor: next, action: 'fold' as AnyAction, sizingBB: 0 }];
        st   = computePreflopState(acts, sbInBB, stradMul, initialInv);
        next = getNextActor(actorOrder, st) ?? null;
      }
      newActs = [...acts, { actor, action, sizingBB }];
    }

    // Eagerly fold unnamed seats between actor and the next named actor so tabs
    // show fold badges immediately rather than waiting for the next action.
    {
      let eagActs = [...newActs];
      let eagSt   = computePreflopState(eagActs, sbInBB, stradMul, initialInv);
      let eagNext = getNextActor(actorOrder, eagSt);
      let eagG    = 0;
      while (eagNext && !namedActors.has(eagNext) && eagG++ < 20) {
        eagActs = [...eagActs, { actor: eagNext, action: 'fold' as AnyAction, sizingBB: 0 }];
        eagSt   = computePreflopState(eagActs, sbInBB, stradMul, initialInv);
        eagNext = getNextActor(actorOrder, eagSt) ?? null;
      }
      newActs = eagActs;
    }

    const newState = computePreflopState(newActs, sbInBB, stradMul, initialInv);
    const potType  = inferPotType(newState.raiseCount, newState.allInActors.size > 0);

    if (action === 'fold' && actor === 'hero') {
      set({ preflopActions: newActs, heroFolded: true, foldedOn: 'preflop', potType, preflopPotBB: newState.potBB, preflopComplete: true });
      onFold();
      return;
    }

    set({ preflopActions: newActs, potType, preflopPotBB: newState.potBB });
    if (isBettingComplete(actorOrder, newState)) {
      // That was the last action this street needed — move straight on
      // instead of showing a "Continue" screen with nothing left to decide.
      set({ preflopComplete: true });
      const activeNamed = [...namedActors].filter(a => !newState.foldedActors.has(a));
      const foldEndsHandNow = newState.foldedActors.size > 0 && activeNamed.length <= 1;
      if (foldEndsHandNow) onFold(); else onNext();
      return;
    }

    // Auto-advance to next named actor, skipping unnamed
    const nextNamed = findNextNamedActor(actor, newState);
    if (nextNamed) { setSelectedActor(nextNamed); setPreSelectedAction(null); }
  };

  // Sub-min all-in: players whose action was closed (matched prevCurrentBetBB and hasActed)
  // cannot re-raise; they may only call or fold.
  const subMinCanRaise =
    !state.subMinAllIn ||
    (state.investedBB[selectedActor] ?? 0) < state.prevCurrentBetBB ||
    !state.hasActed.has(selectedActor);

  // Can selectedActor raise (others still live AND sub-min doesn't block)?
  const canRaiseForSelected = subMinCanRaise && actorOrder.some(a =>
    a !== selectedActor &&
    !state.foldedActors.has(a) &&
    !state.allInActors.has(a)
  );

  // Side pots for display
  const preflopAllActors = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const sidePots = computeSidePots(preflopAllActors, state.investedBB, state.foldedActors, state.allInActors);

  // Named actor actions only in the action list
  const namedActions = draft.preflopActions.filter(e => namedActors.has(e.actor));

  return (
    <StepScroll>
      <View style={styles.ctxStrip}>
        <CardFace card={draft.card1} size="sm" />
        <CardFace card={draft.card2} size="sm" />
        <Text style={styles.ctxText}>Preflop · Pot: {fmtDualAmount(state.potBB, draft)}</Text>
      </View>

      {/* Side pot breakdown — only when there are all-ins with different investment levels */}
      <SidePotStrip pots={sidePots} actorLabel={nameFor} />

      {/* Stack bar — show remaining stacks for named actors */}
      {[...namedActors].some(a => !state.foldedActors.has(a)) && (
        <StackBar actors={[...namedActors]} draft={draft} street="preflop" />
      )}

      {/* Position tabs — flex row, no scroll */}
      <View style={styles.tabRow}>
        {actorOrder.map((actor, idx) => {
          const isSelected = actor === selectedActor;
          const folded     = state.foldedActors.has(actor);
          const allin      = state.allInActors.has(actor);
          const accent     = tabAccent(actor);
          const named      = namedActors.has(actor);
          const lastAct    = [...draft.preflopActions].reverse().find(a => a.actor === actor);
          const showChips  = draft.stackUnit === 'Chips' && draft.bigBlind > 0;
          // Tab badge is too narrow for the full "(BB)" bracket — just the
          // compact number, still never a raw ≥1000 value.
          const fmtTabAmt  = (sz: number) => showChips ? fmtCompact(sz * draft.bigBlind) : `${fmtSize(sz)}BB`;
          const icon =
            folded ? '✕' :
            allin  ? 'ALL IN' :
            lastAct?.action === 'raise' ? '↑' :
            lastAct?.action === 'bet'   ? 'B' :
            lastAct?.action === 'call'  ? '✓' :
            lastAct?.action === 'check' ? '○' : '';
          const sizeLabel =
            !folded && !allin && lastAct && lastAct.sizingBB > 0 &&
            (lastAct.action === 'raise' || lastAct.action === 'bet' || lastAct.action === 'allin')
              ? fmtTabAmt(lastAct.sizingBB) : null;
          return (
            <Pressable key={actor} onPress={() => handleTabPress(actor)} style={{ flex: 1 }}>
              <View style={[
                styles.posTab,
                named && { borderColor: accent + '55' },
                isSelected && { borderColor: accent, backgroundColor: accent + '14' },
                folded && styles.posTabFolded,
                allin && styles.posTabAllin,
              ]}>
                <Text style={[styles.posTabLabel, named && { color: accent }, isSelected && { fontWeight: '800' }]}
                  adjustsFontSizeToFit numberOfLines={1}>
                  {abbrevPos(posLabelAt(idx))}
                </Text>
                {icon ? <Text style={[styles.posTabIcon, { color: folded ? '#bbb' : allin ? '#C8940A' : accent }]} adjustsFontSizeToFit numberOfLines={1}>{icon}</Text> : null}
                {sizeLabel ? <Text style={[styles.posTabAmount, { color: accent }]} adjustsFontSizeToFit numberOfLines={1}>{sizeLabel}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {namedActions.length > 0 && (
        <View style={styles.actionList}>
          {namedActions.map((e, i) => (
            <ActionRow key={i} playerLabel={nameFor(e.actor)} dotColor={dotFor(e.actor)} entry={e} />
          ))}
        </View>
      )}

      {(!bettingDone || isEditing) && (
        <>
          <PotBadge potBB={stateForSelected.potBB} draft={draft} />
          <ActionInput
          actor={selectedActor}
          posLabel={posLabelFor(selectedActor)}
          heroName={heroLabel(draft.heroName)}
          villainName={selectedActor.startsWith('villain') ? villainLabel(selectedActor, draft.villainNames) : undefined}
          currentBetBB={stateForSelected.currentBetBB}
          potBB={stateForSelected.potBB}
          stackBB={stackFor(selectedActor) - (stateForSelected.investedBB[selectedActor] ?? 0)}
          minRaiseBB={stateForSelected.minRaiseBB}
          investedBB={stateForSelected.investedBB[selectedActor] ?? 0}
          initialSizingBB={perActorSizings[selectedActor]}
          isPreflop
          bigBlind={draft.bigBlind}
          gameType={draft.gameType}
          canRaise={canRaiseForSelected}
          preSelectedAction={preSelectedAction ?? undefined}
          onConfirm={doAction}
          onSizingChange={(sz) => {
            pendingSizingRef.current = sz;
            if (sz !== null) setPerActorSizings(prev => ({ ...prev, [selectedActor]: sz }));
          }}
          onSizingOpen={onSizingOpen}
        />
        </>
      )}
      {bettingDone && !isEditing && (
        (draft.heroFolded || foldEndsHand) ? (
          <NextBtn onPress={onFold} label="See Results" />
        ) : (
          <NextBtn onPress={() => { set({ preflopComplete: true }); onNext(); }} label="Continue" />
        )
      )}

      <SkipBtn onPress={() => { set({ preflopComplete: true }); onNext(); }} label="Skip preflop →" />
    </StepScroll>
  );
}

// ── Steps 6/7/8: Street ───────────────────────────────────────────────────────

function StepStreet({ street, phase, onPhaseChange, draft, set, onNext, onFold, onEdit, onSizingOpen }: StepProps & {
  street: 'flop' | 'turn' | 'river'; phase: 'cards' | 'action'; onPhaseChange: (p: 'cards' | 'action') => void;
  onFold: () => void; onEdit: () => void; onSizingOpen?: () => void;
}) {
  const [cardSlot, setCardSlot] = useState(0);
  const [cardsPending, setCardsPending] = useState<Rank | null>(null);
  const labels    = POSITION_LABELS[draft.playerCount] ?? [];
  const heroStack = draft.effectiveStackBB || draft.effectiveStack;

  const streetName = { flop: 'Flop', turn: 'Turn', river: 'River' }[street];
  const nextLabel  = street === 'river' ? 'See Results' : 'Continue';

  const boardCards: (CardType | null)[] =
    street === 'flop' ? [...draft.flopCards] : [street === 'turn' ? draft.turnCard : draft.riverCard];
  const boardCount = street === 'flop' ? 3 : 1;
  const cardsReady = boardCards.filter(Boolean).length === boardCount;

  // Every card used anywhere else in the hand — the picker itself excludes
  // its own OTHER slots' cards internally, so this can just be the full
  // board + hero cards without worrying about self-exclusion here.
  const usedCards: CardType[] = [
    draft.card1, draft.card2,
    ...draft.flopCards,
    draft.turnCard,
    draft.riverCard,
  ].filter(Boolean) as CardType[];

  const streetActions = street === 'flop' ? draft.flopActions : street === 'turn' ? draft.turnActions : draft.riverActions;
  const push = (acts: ActionEntry[]) => {
    if (street === 'flop')  set({ flopActions: acts });
    if (street === 'turn')  set({ turnActions: acts });
    if (street === 'river') set({ riverActions: acts });
  };

  const basePot   = draft.preflopPotBB > 0 ? draft.preflopPotBB : 1.5;
  const flopState = computeStreetState(draft.flopActions, basePot);
  const turnState = computeStreetState(draft.turnActions, flopState.potBB);
  const startPot  = street === 'flop' ? basePot : street === 'turn' ? flopState.potBB : turnState.potBB;
  const state     = computeStreetState(streetActions, startPot);

  const sbInBB     = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradMul   = draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const pfActorOrd = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const pfInitInv  = buildPreflopInvestments(pfActorOrd, sbInBB, stradMul, draft.playerCount);
  const pfState    = computePreflopState(draft.preflopActions, sbInBB, stradMul, pfInitInv);

  const allNamed    = getStreetActors(draft.heroSeat, draft.villainSeats, draft.playerCount, 'postflop');
  const actingOrder = allNamed.filter(a => !pfState.foldedActors.has(a));

  // Should action be skipped entirely? (≤1 live non-allin player entering this street)
  const skipAction = shouldSkipStreetAction(draft, street, actingOrder);

  // Live for THIS street: exclude all-ins/folds from preflop and all prior streets
  const liveAfterPf  = actingOrder.filter(a => !pfState.allInActors.has(a));
  const liveOrder    = street === 'flop' ? liveAfterPf
    : street === 'turn'
      ? liveAfterPf.filter(a => !flopState.allInActors.has(a) && !flopState.foldedActors.has(a))
      : liveAfterPf.filter(a => !flopState.allInActors.has(a) && !flopState.foldedActors.has(a))
                   .filter(a => !turnState.allInActors.has(a) && !turnState.foldedActors.has(a));
  const bettingDone  = draft.heroFolded || skipAction || isBettingComplete(liveOrder, state);
  const currentActor = bettingDone ? null : getNextActor(liveOrder, state);
  // Hand is over once a fold on this street leaves ≤1 player standing — no more
  // streets should be dealt or prompted for; jump straight to results.
  const activeAfterStreet = actingOrder.filter(a => !state.foldedActors.has(a));
  const foldEndsHand = state.foldedActors.size > 0 && activeAfterStreet.length <= 1;

  const posLabelFor = (a: string) => {
    if (a === 'hero') return labels[draft.heroSeat ?? 0] ?? heroLabel(draft.heroName);
    if (a.startsWith('villain')) { const vi = parseInt(a.replace('villain',''),10)-1; return labels[draft.villainSeats[vi]??0] ?? villainLabel(a, draft.villainNames); }
    return '?';
  };
  const dotFor  = (a: string) => a === 'hero' ? HERO_COLOR : a.startsWith('villain') ? (VILLAIN_COLORS[parseInt(a.replace('villain',''),10)-1] ?? VILLAIN_COLORS[0]) : UNNAMED_COLOR;
  const nameFor = (a: string) => {
    if (a === 'hero') return `${heroLabel(draft.heroName)} · ${posLabelFor(a)}`;
    if (a.startsWith('villain')) return `${villainLabel(a, draft.villainNames)} · ${posLabelFor(a)}`;
    return posLabelFor(a);
  };
  const tabAccent = (a: string) => a === 'hero' ? HERO_COLOR : a.startsWith('villain') ? (parseInt(a.replace('villain',''),10)===1 ? '#C04040':'#D4683A') : UNNAMED_COLOR;

  const setBoardCard = (slotIdx: number, card: CardType) => {
    if (street === 'flop') { const n: [CardType|null,CardType|null,CardType|null] = [...draft.flopCards]; n[slotIdx]=card; set({flopCards:n}); }
    else if (street === 'turn') set({ turnCard: card });
    else set({ riverCard: card });
    const nextEmpty = boardCards.findIndex((c, i) => i !== slotIdx && c === null);
    if (nextEmpty !== -1) setCardSlot(nextEmpty);
  };

  const clearBoardCard = (slotIdx: number) => {
    if (street === 'flop') { const n: [CardType|null,CardType|null,CardType|null] = [...draft.flopCards]; n[slotIdx]=null; set({flopCards:n}); }
    else if (street === 'turn') set({ turnCard: null });
    else set({ riverCard: null });
    setCardSlot(slotIdx);
  };

  const handleTabPress = (actor: string) => {
    let lastIdx = -1;
    for (let i = streetActions.length - 1; i >= 0; i--) {
      if (streetActions[i].actor === actor) { lastIdx = i; break; }
    }
    if (lastIdx >= 0) {
      // Rewinding this actor's action invalidates whatever later streets
      // recorded off the old (about-to-change) outcome of this one.
      onEdit();
      push(streetActions.slice(0, lastIdx)); set({ [`${street}Complete`]: false } as any);
    }
  };

  const handleAction = (action: AnyAction, sizingBB: number) => {
    if (!currentActor) return;
    onEdit();
    const newActs = [...streetActions, { actor: currentActor, action, sizingBB }];
    if (action === 'fold' && currentActor === 'hero') {
      push(newActs); set({ heroFolded: true, foldedOn: street, [`${street}Complete`]: true } as any);
      onFold();
      return;
    }
    push(newActs);
    const newState = computeStreetState(newActs, startPot);
    if (isBettingComplete(liveOrder, newState)) {
      // That was the last action this street needed — move straight on
      // instead of showing a "Continue" screen with nothing left to decide.
      set({ [`${street}Complete`]: true } as any);
      const activeAfter = actingOrder.filter(a => !newState.foldedActors.has(a));
      const foldEndsHandNow = newState.foldedActors.size > 0 && activeAfter.length <= 1;
      if (foldEndsHandNow) onFold(); else onNext();
    }
  };

  const boardSoFar: CardType[] = [
    ...draft.flopCards,
    ...(street !== 'flop' ? [draft.turnCard] : []),
    ...(street === 'river' ? [draft.riverCard] : []),
  ].filter(Boolean) as CardType[];

  const actorRemaining = (actor: string): number => {
    const rem = getRemainingStack(actor, draft, street);
    return rem !== null ? rem : (actor.startsWith('villain') ? (draft.villainStacksBB[actor] ?? heroStack) : heroStack);
  };

  const otherLive = currentActor
    ? liveOrder.filter(a => a !== currentActor && !state.foldedActors.has(a) && !state.allInActors.has(a))
    : [];
  const subMinCanRaiseStreet = !state.subMinAllIn ||
    (currentActor ? (state.investedBB[currentActor] ?? 0) < state.prevCurrentBetBB : false) ||
    (currentActor ? !state.hasActed.has(currentActor) : false);
  const canRaise = otherLive.length > 0 && subMinCanRaiseStreet;

  // Side pots for display (computed from all street actors' cumulative investments — use preflop state)
  const streetSidePots = computeSidePots(actingOrder, state.investedBB, state.foldedActors, state.allInActors);

  if (phase === 'cards') {
    const dealAndContinue = () => {
      set({ [`${street}Complete`]: true } as any);
      onNext();
    };
    const dealAndAction = () => { setCardSlot(0); onPhaseChange('action'); };
    const advance = skipAction ? dealAndContinue : dealAndAction;

    const guardedSkip = () => {
      if (cardsPending) { Alert.alert('Finish this card?', `You picked ${cardsPending} but haven't chosen a suit yet.`, [
        { text: 'Keep picking', style: 'cancel' },
        { text: 'Skip anyway', style: 'destructive', onPress: advance },
      ]); return; }
      advance();
    };

    return (
      <StepScroll>
        <Label text={`${streetName} cards`} />
        <CardPicker
          cards={boardCards} activeSlot={cardSlot} onSlotPress={setCardSlot}
          onCardPicked={setBoardCard} onClear={clearBoardCard}
          cardSize="lg" usedCards={usedCards}
          onAllFilled={advance}
          onPendingChange={setCardsPending}
        />
        {/* Only needed if the user arrives here with the street's cards
            already picked (back navigation) — a fresh pick auto-advances. */}
        {cardsReady && (
          <FadeSlideIn key="continue"><NextBtn onPress={advance} label="Continue" /></FadeSlideIn>
        )}
        <SkipBtn onPress={guardedSkip} label={`Skip — no ${streetName} cards`} />
      </StepScroll>
    );
  }

  return (
    <StepScroll>
      <View style={styles.ctxStrip}>
        <CardFace card={draft.card1} size="sm" />
        <CardFace card={draft.card2} size="sm" />
        <View style={styles.ctxSep} />
        {boardSoFar.map((c, i) => <CardFace key={i} card={c} size="sm" />)}
        <Text style={styles.ctxText}>Pot: {fmtDualAmount(state.potBB, draft)}</Text>
      </View>

      {actingOrder.length > 0 && <StackBar actors={actingOrder} draft={draft} street={street} />}
      <SidePotStrip pots={streetSidePots} actorLabel={nameFor} />

      {skipAction ? (
        <>
          <View style={[styles.outcomeBanner, { backgroundColor: '#EEE8D8', marginTop: 8 }]}>
            <Text style={[styles.outcomeTitle, { color: '#6B5020', fontSize: 16 }]}>All players all-in</Text>
            <Text style={styles.outcomeSub}>Running out the board</Text>
          </View>
          <NextBtn onPress={() => { set({ [`${street}Complete`]: true } as any); onNext(); }} label={nextLabel} />
        </>
      ) : (
        <>
          {liveOrder.length > 1 && (
            <View style={styles.tabRow}>
              {liveOrder.map((actor) => {
                const isCurrent = actor === currentActor;
                const folded    = state.foldedActors.has(actor);
                const allin     = state.allInActors.has(actor);
                const accent    = tabAccent(actor);
                const lastAct   = [...streetActions].reverse().find(a => a.actor === actor);
                const icon = folded ? '✕' : allin ? 'ALL IN' :
                  lastAct?.action === 'raise' ? '↑' :
                  lastAct?.action === 'bet'   ? 'B' :
                  lastAct?.action === 'call'  ? '✓' : lastAct?.action === 'check' ? '○' : '';
                return (
                  <Pressable key={actor} onPress={() => handleTabPress(actor)} style={{ flex: 1 }}>
                    <View style={[styles.posTab, { borderColor: accent + '55' },
                      isCurrent && { borderColor: accent, backgroundColor: accent + '14' },
                      folded && styles.posTabFolded,
                      allin && styles.posTabAllin]}>
                      <Text style={[styles.posTabLabel, { color: isCurrent ? accent : C.text }, folded && { color: '#aaa' }]}
                        adjustsFontSizeToFit numberOfLines={1}>
                        {abbrevPos(posLabelFor(actor))}
                      </Text>
                      {icon ? <Text style={[styles.posTabIcon, { color: folded ? '#bbb' : allin ? '#C8940A' : accent }]}>{icon}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {streetActions.length > 0 && (
            <View style={styles.actionList}>
              {streetActions.map((e, i) => <ActionRow key={i} playerLabel={nameFor(e.actor)} dotColor={dotFor(e.actor)} entry={e} />)}
            </View>
          )}

          {!bettingDone && currentActor ? (
            <>
              <PotBadge potBB={state.potBB} draft={draft} />
              <ActionInput
                actor={currentActor} posLabel={posLabelFor(currentActor)}
                heroName={heroLabel(draft.heroName)}
                villainName={currentActor.startsWith('villain') ? villainLabel(currentActor, draft.villainNames) : undefined}
                currentBetBB={state.currentBetBB} potBB={state.potBB}
                stackBB={actorRemaining(currentActor)}
                minRaiseBB={state.minRaiseBB > 0 ? state.minRaiseBB : Math.max(1, state.currentBetBB * 2 || 2)}
                investedBB={state.investedBB[currentActor] ?? 0}
                isPreflop={false} bigBlind={draft.bigBlind} gameType={draft.gameType}
                canRaise={canRaise}
                onConfirm={handleAction}
                onSizingOpen={onSizingOpen}
              />
            </>
          ) : bettingDone ? (
            <>
              <PotBadge potBB={state.potBB} draft={draft} />
              {(draft.heroFolded || foldEndsHand) ? (
                <NextBtn onPress={onFold} label="See Results" />
              ) : (
                <NextBtn onPress={() => { set({ [`${street}Complete`]: true } as any); onNext(); }} label={nextLabel} />
              )}
              <SkipBtn onPress={() => onPhaseChange('cards')} label={`← Edit ${streetName} cards`} />
            </>
          ) : null}
        </>
      )}
    </StepScroll>
  );
}

// ── Hand history ──────────────────────────────────────────────────────────────

// Standard hand-history notation (Ah, 7c, 2d) rather than the app's own
// suit glyphs — the export is meant to read like a normal hand history.
const SUIT_LETTER: Record<string, string> = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
function cardStr(c: CardType): string { return `${c.rank}${SUIT_LETTER[c.suit]}`; }

function buildHistory(draft: HandDraft): string {
  const labels  = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? (labels[draft.heroSeat] ?? '?') : '?';
  const namedVillains = draft.villainSeats.map((_, i) => `villain${i + 1}`);

  const posFor = (a: string) => {
    if (a === 'hero') return heroPos;
    if (a.startsWith('villain')) { const vi = parseInt(a.replace('villain', ''), 10) - 1; return labels[draft.villainSeats[vi]] ?? '?'; }
    if (a.startsWith('seat_')) { const si = parseInt(a.replace('seat_', ''), 10); return labels[si] ?? '?'; }
    return '?';
  };
  // Custom nickname if one was entered on the Position step, else "Villain
  // N" (never a bare "Villain") — so the player list and the action lines
  // below it always refer to the same name. An unnamed seat (only possible
  // in a side pot's eligible list, never in the action lines themselves)
  // falls back to its table position instead.
  const nameFor = (a: string) => {
    if (a === 'hero') return heroLabel(draft.heroName);
    if (a.startsWith('villain')) return villainLabel(a, draft.villainNames);
    return posFor(a);
  };

  // ── Units: BB throughout, unless this hand was actually tracked in the
  // raw unit too, in which case every amount shows both — a bare number
  // means nothing without the blind level it was played at. A cash hand
  // gets a $ sign; a tournament never does.
  const fmtAmt = (bb: number) => fmtDualAmount(bb, draft);

  // ── Starting stacks — a villain's is only "known" if it was actually typed
  // in; otherwise it's assumed equal to Hero's for math, but never presented
  // as a precise all-in figure (see fmtA's 'allin' case below). ─────────────
  const heroStackBB = draft.effectiveStackBB || draft.effectiveStack;
  const stackKnown = (a: string) => a === 'hero' ? heroStackBB > 0 : !!(draft.villainStacksBB[a] && draft.villainStacksBB[a] > 0);
  const stackFor   = (a: string) => a === 'hero' ? heroStackBB : (stackKnown(a) ? draft.villainStacksBB[a] : heroStackBB);

  // A call/bet/raise that happens to exhaust the actor's whole stack is just
  // as much an all-in as tapping the dedicated All-In button (e.g. "Call
  // All-In" is stored as a plain 'call' action) — detect it from the running
  // total invested rather than only trusting the action's own type, so the
  // "don't show a fabricated number for an unknown stack" rule applies no
  // matter which control produced the action.
  const fmtA = (e: ActionEntry, priorTotal: Record<string, number>) => {
    const n = nameFor(e.actor);
    if (e.action === 'fold')  return `${n} folds`;
    if (e.action === 'check') return `${n} checks`;

    const stack = stackFor(e.actor);
    const totalAfter = (priorTotal[e.actor] ?? 0) + e.sizingBB;
    const isAllIn = e.action === 'allin' || (stack > 0 && totalAfter >= stack - 0.01);
    if (isAllIn) return stackKnown(e.actor) ? `${n} is all in for ${fmtAmt(e.sizingBB)}` : `${n} is all in`;

    switch (e.action) {
      case 'call':  return `${n} calls ${fmtAmt(e.sizingBB)}`;
      case 'bet':   return `${n} bets ${fmtAmt(e.sizingBB)}`;
      case 'raise': return `${n} raises to ${fmtAmt(e.sizingBB)}`;
      default:      return `${n} ${e.action}`;
    }
  };
  const namedOnly = (acts: ActionEntry[]) => acts.filter(e => e.actor === 'hero' || e.actor.startsWith('villain'));
  const streetLine = (acts: ActionEntry[], priorTotal: Record<string, number>) =>
    namedOnly(acts).map(e => fmtA(e, priorTotal)).join(', ');

  // ── Pot math — each street's state is threaded from the previous street's
  // ending pot, so every number here is the running total of every bet and
  // call from every player across the whole hand, not just this street.
  // Shared with the visual share card so the two can never disagree. ───────
  const handMath = computeHandMath(draft);
  const { actorOrder, pf, pfPotBB, flop, turn, river, finalPotBB, priorFlop, priorTurn, priorRiver } = handMath;

  // ── Header ──────────────────────────────────────────────────────────────
  const anteLabel = draft.anteType === 'bbAnte' ? 'BB Ante' : draft.anteType === 'ante' ? 'Ante' : '';
  // "Stakes" is a cash-game term (a $ price per BB); tournament chips have no
  // real-money price, so that line reads as "Blinds" instead.
  const stakesLine = draft.gameType === 'cash'
    ? `Stakes: $${fmtCompact(draft.cashSB)}/$${fmtCompact(draft.cashBB)}${draft.straddleEnabled ? ' · Straddle' : ''}`
    : `Blinds: ${fmtCompact(draft.tournamentSB)}/${fmtCompact(draft.tournamentBB)}${anteLabel ? ' ' + anteLabel : ''}`;

  const c1 = draft.card1 ? cardStr(draft.card1) : null;
  const c2 = draft.card2 ? cardStr(draft.card2) : null;

  const lines = [stakesLine];
  lines.push(`${nameFor('hero')} (${heroPos}): ${fmtAmt(heroStackBB)}${c1 && c2 ? ` [${c1} ${c2}]` : ''}`);
  namedVillains.forEach(v => {
    // Stack falls back to Hero's (same convention as the rest of the math)
    // when a villain's own stack was never entered — always show a number
    // here rather than silently omitting it.
    lines.push(`${nameFor(v)} (${posFor(v)}): ${fmtAmt(stackFor(v))}`);
  });
  lines.push('');

  // ── Streets — preflop has no pot prefix (nothing's been bet before it);
  // every street after shows the running pot in parens next to its name.
  // A blank line separates each street for readability. ────────────────────
  const preflopStr = streetLine(draft.preflopActions, {});
  lines.push(`Preflop:${preflopStr ? ' ' + preflopStr : ' (no action recorded)'}`);
  lines.push('');

  const pushStreet = (label: string, board: string, potBB: number, acts: ActionEntry[], priorTotal: Record<string, number>) => {
    const actsStr = streetLine(acts, priorTotal);
    lines.push(`${label} (${fmtAmt(potBB)}): ${board}${actsStr ? ' — ' + actsStr : ''}`);
    lines.push('');
  };
  // Each street header shows the pot as it stood ENTERING that street (the
  // standard hand-history convention, e.g. "Flop (6BB): ... Hero bets 4BB"),
  // not the pot after that street's own action — that ending value belongs
  // to the START of the next street instead.
  if (draft.flopCards.some(Boolean)) {
    pushStreet('Flop', draft.flopCards.filter(Boolean).map(c => cardStr(c!)).join(' '), pfPotBB, draft.flopActions, priorFlop);
  }
  if (draft.turnCard) {
    const board = [...draft.flopCards, draft.turnCard].filter(Boolean).map(c => cardStr(c!)).join(' ');
    pushStreet('Turn', board, flop.potBB, draft.turnActions, priorTurn);
  }
  if (draft.riverCard) {
    const board = [...draft.flopCards, draft.turnCard, draft.riverCard].filter(Boolean).map(c => cardStr(c!)).join(' ');
    pushStreet('River', board, turn.potBB, draft.riverActions, priorRiver);
  }

  // ── Result — side pots (only present when there's a genuine all-in
  // disparity) are broken out separately rather than folded into one total. ──
  const totalInvested: Record<string, number> = {};
  for (const a of actorOrder) {
    totalInvested[a] = (pf.investedBB[a] ?? 0) + (flop.investedBB[a] ?? 0) + (turn.investedBB[a] ?? 0) + (river.investedBB[a] ?? 0);
  }
  const everFolded = new Set([...pf.foldedActors, ...flop.foldedActors, ...turn.foldedActors, ...river.foldedActors]);
  const everAllIn  = new Set([...pf.allInActors,  ...flop.allInActors,  ...turn.allInActors,  ...river.allInActors]);
  const sidePots = computeSidePots(actorOrder, totalInvested, everFolded, everAllIn);
  // Only genuinely multi-player-contested pots count — matches the same
  // "≥2 eligible" threshold the live SidePotStrip UI uses elsewhere.
  const contestedPots = sidePots.filter(p => p.eligible.length >= 2);

  // A villain folding at some point doesn't necessarily end the hand — in a
  // 3-way pot the remaining players still contest the pot. `situation` is
  // only 'villain_folded' when EVERY villain has folded, leaving Hero the
  // lone survivor; otherwise it's a real showdown among whoever's still in.
  const { situation, liveVillains } = computeHandOutcome(draft);

  const potBeforeDecisiveFold = () => computePotBeforeDecisiveFold(draft, handMath);

  if (situation === 'showdown') {
    liveVillains.forEach(vKey => {
      const [sc1, sc2] = draft.villainHoleCards[vKey] ?? [null, null];
      if (sc1 && sc2) lines.push(`${nameFor(vKey)} shows ${cardStr(sc1)} ${cardStr(sc2)}`);
    });
  }

  if (contestedPots.length >= 2) {
    contestedPots.forEach((p, i) => {
      const label = i === 0 ? 'Main pot' : `Side pot ${i}`;
      const who = p.eligible.map(nameFor).join(', ');
      lines.push(`${label}: ${fmtAmt(p.amount)} (${who})`);
    });
  }

  if (situation === 'hero_folded') {
    lines.push(`${nameFor('hero')} folds. Pot (${fmtAmt(potBeforeDecisiveFold())}) goes to the table.`);
  } else if (situation === 'villain_folded') {
    lines.push(`${nameFor('hero')} wins ${fmtAmt(potBeforeDecisiveFold())}`);
  } else if (draft.villainMucked) {
    lines.push(`Villain mucks. ${nameFor('hero')} wins ${fmtAmt(finalPotBB)}`);
  } else if (draft.winner === 'hero') {
    lines.push(`${nameFor('hero')} wins ${fmtAmt(finalPotBB)}`);
  } else if (draft.winner) {
    // A specific villain was picked as the winner (multi-way showdown).
    lines.push(`${nameFor(draft.winner)} wins ${fmtAmt(finalPotBB)}`);
  } else if (draft.result === 'won') {
    lines.push(`${nameFor('hero')} wins ${fmtAmt(finalPotBB)}`);
  } else if (draft.result === 'lost') {
    lines.push(`Villain wins ${fmtAmt(finalPotBB)}`);
  } else {
    lines.push(`Pot: ${fmtAmt(finalPotBB)}`);
  }

  return lines.join('\n');
}

// ── Step 9: Result ────────────────────────────────────────────────────────────

function StepResult({ draft, set, onNext }: StepProps) {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];

  // Single source of truth shared with the export — a villain folding
  // earlier doesn't end a multi-way pot while someone else is still in it,
  // and reaching the river via an all-in runout (no one ever folded) is
  // always a real showdown, never an assumed Hero win.
  const { situation, liveVillains } = computeHandOutcome(draft);

  // Single source of truth for pot math, shared with the export and the
  // Hand Review screen — no separate re-derivation here to drift out of
  // sync with those.
  const handMath = computeHandMath(draft);
  const autoPot  = handMath.finalPotBB;
  const heroInvested = (handMath.pf.investedBB['hero'] ?? 0) + (handMath.flop.investedBB['hero'] ?? 0)
    + (handMath.turn.investedBB['hero'] ?? 0) + (handMath.river.investedBB['hero'] ?? 0);

  // The winner's own net gain (pot won minus their own investment) — never
  // the gross pot size, which overstates what either player actually made
  // or lost by however much they themselves put in to win it back.
  const fmtNetGain = (bb: number) => `+${fmtDualAmount(Math.abs(bb), draft)}`;

  const [villainCardsSkipped, setVillainCardsSkipped] = useState(false);
  const [villainSlots, setVillainSlots] = useState<Record<string, number>>({});
  const [confirmedVillains, setConfirmedVillains] = useState<Set<string>>(new Set());

  const nameFor = (a: string) => {
    if (a === 'hero') return `${heroLabel(draft.heroName)} · ${labels[draft.heroSeat??0]??'?'}`;
    if (a.startsWith('villain')) return `${villainLabel(a, draft.villainNames)} · ${labels[draft.villainSeats[parseInt(a.replace('villain',''),10)-1]??0]??'?'}`;
    return '?';
  };
  const villainNum = (a: string) => parseInt(a.replace('villain', ''), 10);

  // Used cards for hole-card picker: hero cards + board cards + other villains' cards
  const boardUsedCards: CardType[] = [
    draft.card1, draft.card2,
    ...draft.flopCards,
    draft.turnCard,
    draft.riverCard,
  ].filter(Boolean) as CardType[];

  return (
    <StepScroll>
      {/* Outcome banner */}
      {situation === 'hero_folded' && (
        <View style={[styles.outcomeBanner, { backgroundColor: '#FEE8E8' }]}>
          <Text style={[styles.outcomeTitle, { color: '#C04040' }]}>You Folded</Text>
          <Text style={styles.outcomeSub}>Villain {fmtNetGain(heroInvested)}</Text>
        </View>
      )}
      {situation === 'villain_folded' && (
        <View style={[styles.outcomeBanner, { backgroundColor: '#E8F5EE' }]}>
          <Text style={[styles.outcomeTitle, { color: HERO_COLOR }]}>Villain Folded — You Win</Text>
          <Text style={styles.outcomeSub}>Hero {fmtNetGain(computeFoldWinNet(draft, handMath))}</Text>
        </View>
      )}
      {situation === 'showdown' && (
        <View style={[styles.outcomeBanner, { backgroundColor: '#EEE8D8' }]}>
          <Text style={[styles.outcomeTitle, { color: '#6B5020' }]}>Showdown</Text>
          <Text style={styles.outcomeSub}>{fmtSize(autoPot)}BB pot</Text>
        </View>
      )}

      {/* Showdown: optionally record cards for whichever villains are still
          live — a villain who folded earlier isn't offered here or in the
          export. Who actually won is never asked; the export just states
          the pot when it can't be auto-determined from a fold. */}
      {situation === 'showdown' && (
        <>
          {!villainCardsSkipped && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Text style={styles.label}>Add villain cards (optional)</Text>
                <Pressable onPress={() => setVillainCardsSkipped(true)} hitSlop={8} style={{ marginLeft: 'auto' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Skip</Text>
                </Pressable>
              </View>

              {liveVillains.map((vKey) => {
                const color     = VILLAIN_COLORS[villainNum(vKey) - 1] ?? VILLAIN_COLORS[0];
                const vLabel    = nameFor(vKey);
                const cards     = draft.villainHoleCards[vKey] ?? [null, null];
                const slot      = villainSlots[vKey] ?? 0;
                const isConfirmed = confirmedVillains.has(vKey);
                const bothPicked  = cards[0] !== null && cards[1] !== null;
                const otherVillainCards: CardType[] = liveVillains
                  .filter(v => v !== vKey)
                  .flatMap(v => draft.villainHoleCards[v] ?? [null, null])
                  .filter(Boolean) as CardType[];
                const usedCards = [...boardUsedCards, ...otherVillainCards];

                return (
                  <View key={vKey} style={[styles.villainCardSection, { borderColor: isConfirmed ? color : color + '55' }]}>
                    <View style={styles.villainCardHeader}>
                      <View style={[styles.actorDot, { backgroundColor: color }]} />
                      <Text style={[styles.villainCardTitle, { color }]}>{vLabel}</Text>
                      {isConfirmed && (
                        <Pressable onPress={() => setConfirmedVillains(prev => { const s = new Set(prev); s.delete(vKey); return s; })}
                          style={{ marginLeft: 'auto' }}>
                          <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '500' }}>Change</Text>
                        </Pressable>
                      )}
                    </View>
                    {isConfirmed ? (
                      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', paddingVertical: 8 }}>
                        <CardFace card={cards[0]} size="md" />
                        <CardFace card={cards[1]} size="md" />
                      </View>
                    ) : (
                      <>
                        <CardPicker
                          cards={cards}
                          activeSlot={slot}
                          onSlotPress={(s) => setVillainSlots(prev => ({ ...prev, [vKey]: s }))}
                          onCardPicked={(s, card) => {
                            const next: [CardType | null, CardType | null] = [...(draft.villainHoleCards[vKey] ?? [null, null])] as [CardType | null, CardType | null];
                            next[s] = card;
                            set({ villainHoleCards: { ...draft.villainHoleCards, [vKey]: next } });
                            const nextEmpty = next.findIndex((c, idx) => idx !== s && c === null);
                            if (nextEmpty !== -1) setVillainSlots(prev => ({ ...prev, [vKey]: nextEmpty }));
                          }}
                          onClear={(s) => {
                            const next: [CardType | null, CardType | null] = [...(draft.villainHoleCards[vKey] ?? [null, null])] as [CardType | null, CardType | null];
                            next[s] = null;
                            set({ villainHoleCards: { ...draft.villainHoleCards, [vKey]: next } });
                            setVillainSlots(prev => ({ ...prev, [vKey]: s }));
                          }}
                          usedCards={usedCards}
                        />
                        {bothPicked && (
                          <Pressable onPress={() => setConfirmedVillains(prev => new Set([...prev, vKey]))}
                            style={({ pressed }) => [styles.confirmCardBtn, pressed && { opacity: 0.8 }]}>
                            <Text style={styles.confirmCardBtnText}>Confirm Cards ✓</Text>
                          </Pressable>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </>
      )}

      <NextBtn onPress={() => {
        const update: Partial<HandDraft> = { potSizeBB: Math.round(autoPot) };
        // Only a true fold-to-one-player situation gets an auto-assigned
        // winner — a real showdown's winner comes from the picker above,
        // never assumed here.
        if (situation === 'villain_folded') { update.result = 'won'; update.winner = 'hero'; }
        else if (situation === 'hero_folded') update.result = 'lost';
        set(update);
        onNext();
      }} label="Continue" />
    </StepScroll>
  );
}

// ── Step 9: Name & Save ────────────────────────────────────────────────────────

function StepNameTag({ draft, set, onSave, onFocusScroll, onOpenShareSheet, sharingImage }: StepProps & {
  onSave: () => void; onFocusScroll?: () => void; onOpenShareSheet: () => void; sharingImage: boolean;
}) {
  const auto = autoHandName(draft);

  // Staggered reveal — each group lands 50ms after the previous one, top to
  // bottom, for a polished "unrolling" feel on the last screen of the flow.
  return (
    <StepScroll>
      <FadeSlideIn delay={0} style={{ gap: 14 }}>
        <Label text="Name this hand" />
        <TextInput style={styles.nameInput} placeholder={auto} placeholderTextColor={C.textSecondary}
          value={draft.handName} onChangeText={(v) => set({ handName: v })} maxLength={80} returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()} onFocus={onFocusScroll} />
        <Text style={styles.nameHint}>Leave blank to auto-generate: &quot;{auto}&quot;</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={50} style={{ gap: 14 }}>
        <Label text="Notes" />
        <TextInput style={styles.notesInput} placeholder="Any thoughts on this hand…"
          placeholderTextColor={C.textSecondary} value={draft.notes}
          onChangeText={(v) => set({ notes: v })} multiline maxLength={300} onFocus={onFocusScroll} />
        <DoneLink />
      </FadeSlideIn>
      <FadeSlideIn delay={100}>
        <ScaleButton onPress={onOpenShareSheet} disabled={sharingImage} style={[styles.shareBtn, sharingImage && { opacity: 0.5 }]}>
          <Text style={styles.shareBtnText}>{sharingImage ? 'Preparing image…' : 'Share Hand'}</Text>
        </ScaleButton>
      </FadeSlideIn>
      <FadeSlideIn delay={150}>
        <ScaleButton onPress={() => Share.share({ message: buildHistory(draft) }).catch(() => {})} style={styles.shareTextLink}>
          <Text style={styles.shareTextLinkText}>Copy / share as text</Text>
        </ScaleButton>
      </FadeSlideIn>
      <FadeSlideIn delay={200}>
        <ScaleButton onPress={onSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save Hand</Text>
        </ScaleButton>
      </FadeSlideIn>
    </StepScroll>
  );
}

// ── Accordion section shell + summaries ────────────────────────────────────────

function fmtActionShort(entry: ActionEntry): string {
  switch (entry.action) {
    case 'fold':  return 'fold';
    case 'check': return 'check';
    case 'call':  return `call ${fmtSize(entry.sizingBB)}BB`;
    case 'bet':   return `bet ${fmtSize(entry.sizingBB)}BB`;
    case 'raise': return `raise ${fmtSize(entry.sizingBB)}BB`;
    case 'allin': return `all-in ${fmtSize(entry.sizingBB)}BB`;
    default:      return entry.action;
  }
}

function posLabelForActor(draft: HandDraft, actor: string): string {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  if (actor === 'hero') return labels[draft.heroSeat ?? 0] ?? heroLabel(draft.heroName);
  if (actor.startsWith('villain')) {
    const vi = parseInt(actor.replace('villain', ''), 10) - 1;
    return labels[draft.villainSeats[vi] ?? 0] ?? villainLabel(actor, draft.villainNames);
  }
  return '?';
}

function summaryGameSetup(draft: HandDraft): string {
  if (!draft.gameType) return 'Not set';
  const kind = draft.gameType === 'tournament' ? 'Tournament' : 'Cash';
  const stakes = draft.gameType === 'cash'
    ? (draft.stakes && draft.stakes !== 'other' ? draft.stakes : `$${fmtSize(draft.cashSB)}/$${fmtSize(draft.cashBB)}`)
    : `${fmtSize(draft.tournamentSB)}/${fmtSize(draft.tournamentBB)}`;
  const stack = draft.effectiveStackBB || draft.effectiveStack;
  return `${kind} · ${stakes} · ${fmtSize(stack)}BB eff`;
}

function summaryPosition(draft: HandDraft): string {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  const heroLabel = draft.heroSeat !== null ? (labels[draft.heroSeat] ?? '?') : '?';
  const villainLabels = draft.villainSeats.filter(s => s >= 0).map(s => labels[s] ?? '?');
  if (villainLabels.length === 0) return heroLabel;
  return `${heroLabel} vs ${villainLabels.join(', ')}`;
}

function summaryCards(draft: HandDraft): string {
  if (!draft.card1 || !draft.card2) return 'No cards recorded';
  return `${cardLabel(draft.card1)}  ${cardLabel(draft.card2)}`;
}

// Read-only one-line recap — position + shorthand action for every named
// actor, followed by the pot/board context.
function summaryPreflop(draft: HandDraft): string {
  const named = draft.preflopActions.filter(e => e.actor === 'hero' || e.actor.startsWith('villain'));
  if (named.length === 0) return 'Skipped';
  const parts = named.map(e => `${abbrevPos(posLabelForActor(draft, e.actor))} ${fmtActionShort(e)}`);
  return `${parts.join(' · ')} — ${fmtSize(draft.preflopPotBB)}BB (${draft.potType})`;
}

function summaryStreet(street: 'flop' | 'turn' | 'river', draft: HandDraft): string {
  const board = street === 'flop'
    ? draft.flopCards.filter(Boolean).map(c => cardLabel(c!)).join(' ')
    : street === 'turn' ? (draft.turnCard ? cardLabel(draft.turnCard) : '')
    : (draft.riverCard ? cardLabel(draft.riverCard) : '');
  const actions = street === 'flop' ? draft.flopActions : street === 'turn' ? draft.turnActions : draft.riverActions;
  if (actions.length === 0) {
    if (isAllInRunout(draft, street)) {
      const label = street === 'river' ? 'All in — run out' : 'All in — cards to come';
      return board ? `${board} — ${label}` : label;
    }
    return board || 'Skipped';
  }
  const parts = actions.map(e => `${abbrevPos(posLabelForActor(draft, e.actor))} ${fmtActionShort(e)}`);
  return `${board} — ${parts.join(' · ')}`;
}

function summaryResult(draft: HandDraft): string {
  const hero = heroLabel(draft.heroName);
  if (draft.heroFolded) return `${hero} folded`;
  if (draft.result === 'won') return draft.villainMucked ? `Villain mucked — ${hero} wins` : `Showdown — ${hero} wins`;
  if (draft.result === 'lost') {
    return draft.winner && draft.winner !== 'hero'
      ? `Showdown — ${villainLabel(draft.winner, draft.villainNames)} wins`
      : `Showdown — ${hero} loses`;
  }
  return 'Showdown';
}

// A street's own labelled boundary — "——— FLOP ———" — used instead of the
// plain grey label so moving from preflop into a new street reads as
// crossing into a new chapter of the hand, not more of the same block.
function StreetDivider({ label }: { label: string }) {
  return (
    <View style={styles.streetDividerRow}>
      <View style={styles.streetDividerLine} />
      <Text style={styles.streetDividerLabel}>{label}</Text>
      <View style={styles.streetDividerLine} />
    </View>
  );
}

interface SectionWrapProps {
  title: string;
  summary: string;
  isDone: boolean;
  // Preflop/Flop/Turn/River use the bolder divider treatment (StreetDivider)
  // instead of the plain small-caps label every other section gets.
  divider?: boolean;
  children: ReactNode;
  // Reopens this section for editing — only wired (and only rendered as
  // tappable) once the section is actually done, so the active section
  // itself never fights with its own live inputs for the tap.
  onPress?: () => void;
}

// One screen's section: a persistent label above a card — done, it's a
// read-only recap row (checkmark + one-line summary) that's tappable to
// jump straight back into editing it; active, it's the fully live-editable
// body for the step you're currently on (marked out by the green
// left-border accent). The accent is a separate absolutely-positioned bar
// (not a real border) so it can fade in/out on its own — the card reserves
// its width permanently via paddingLeft so nothing shifts.
function SectionWrap({ title, summary, isDone, divider, children, onPress }: SectionWrapProps) {
  const accentOpacity = useRef(new Animated.Value(isDone ? 0 : 1)).current;
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    Animated.timing(accentOpacity, {
      toValue: isDone ? 0 : 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isDone, accentOpacity]);

  const card = (
    <View style={[styles.sectionCard, isDone ? styles.sectionCardDone : styles.sectionCardActive]}>
      {isDone && <View style={styles.sectionGreyBar} />}
      <Animated.View pointerEvents="none" style={[styles.sectionAccentBar, { opacity: accentOpacity }]} />
      {isDone ? (
        <>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionDoneSummary} numberOfLines={1}>{summary}</Text>
          </View>
          <AnimatedCheckmark />
        </>
      ) : children}
    </View>
  );

  return (
    <View>
      {divider ? <StreetDivider label={title} /> : <Text style={styles.sectionLabel}>{title}</Text>}
      {isDone && onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          {card}
        </Pressable>
      ) : card}
    </View>
  );
}

// ── Root modal ────────────────────────────────────────────────────────────────

export interface LogHandModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: HandDraft) => void;
  // When set, the flow opens pre-filled with this hand instead of a blank
  // one, landing straight on the final (Name & Save) step with every prior
  // section already collapsed and done — the "swipe to edit" entry point.
  initialDraft?: HandDraft | null;
}

export function LogHandModal({ visible, onClose, onSave, initialDraft }: LogHandModalProps) {
  const [step,  setStep]  = useState(1);
  const [draft, setDraft] = useState<HandDraft>(INITIAL_DRAFT);
  const [flopPhase,  setFlopPhase]  = useState<'cards' | 'action'>('cards');
  const [turnPhase,  setTurnPhase]  = useState<'cards' | 'action'>('cards');
  const [riverPhase, setRiverPhase] = useState<'cards' | 'action'>('cards');

  // Seed from the hand being edited every time the modal opens — the same
  // completion flags saved with that hand (preflopComplete etc.) are what
  // let the accordion render every section already collapsed/done.
  useEffect(() => {
    if (!visible) return;
    if (initialDraft) {
      setDraft(initialDraft);
      setStep(TOTAL_STEPS);
      setFlopPhase('action'); setTurnPhase('action'); setRiverPhase('action');
    }
  }, [visible, initialDraft]);
  const scrollRef = useRef<ScrollView>(null);
  // Measured on layout — see the Positions scroll-target special-case below.
  const positionsY = useRef(0);
  // Same idea, for the Blinds & Stack step: its SB/BB fields sit well above
  // the bottom of the content, so scrollToEnd() overshoots past them — the
  // keyboard opening over a field the scroll position hasn't accounted for
  // is exactly what hides the number the user is typing.
  const blindsY = useRef(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Shared by the notes field's focus handler and the raise/bet sizing
  // panel's open handler — both need "reveal the newly-grown bottom of the
  // screen" and neither can reach scrollRef directly.
  const scrollToEndSoon = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  const scrollToBlindsSoon = () => setTimeout(
    () => scrollRef.current?.scrollTo({ y: Math.max(0, blindsY.current - 8), animated: true }), 50);

  // Share-card capture — the ViewShot node itself renders off-screen (see
  // hiddenCardHost below), never visible as a preview anywhere; it's only
  // ever generated the moment the user taps Share and confirms.
  const viewShotRef = useRef<ViewShot>(null);
  const [sharingImage, setSharingImage] = useState(false);
  // Most people sharing a hand don't want to spoil what villain held.
  const [hideVillainCards, setHideVillainCards] = useState(true);
  // Tapping Share opens this small confirm sheet (toggle + Share/Cancel)
  // rather than sharing immediately.
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  const handleShareImage = async () => {
    if (sharingImage) return;
    setSharingImage(true);
    try {
      // Let the sheet's closing animation and any last-second re-render from
      // the villain-cards toggle actually flush to the native view before
      // snapshotting it — capturing mid-transition is a known way for
      // react-native-view-shot to hang instead of resolving or rejecting.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!viewShotRef.current?.capture) throw new Error("Share card isn't ready yet — try again in a moment.");
      const uri = await withTimeout(viewShotRef.current.capture(), 10000, 'Image generation timed out — please try again.');
      if (!uri) throw new Error('No image was generated — please try again.');
      // Capture succeeded — don't leave the button reading "Preparing…" for
      // however long the OS share sheet stays open waiting on the user.
      setSharingImage(false);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Hand' });
      } else {
        Alert.alert("Sharing isn't available", 'This device has no share sheet to send the image through.');
      }
    } catch (err) {
      console.error('[ShareHand:TagSave] failed:', err);
      setSharingImage(false);
      Alert.alert('Could not share hand', err instanceof Error ? err.message : 'Something went wrong generating the image.');
    }
  };
  const openShareSheet = () => setShareSheetOpen(true);
  const confirmShareImage = () => { setShareSheetOpen(false); handleShareImage(); };

  const set  = (u: Partial<HandDraft>) => setDraft(prev => ({ ...prev, ...u }));
  const next = () => { animateAccordion(); setStep(s => Math.min(s + 1, TOTAL_STEPS)); };
  const skip = () => { animateAccordion(); setStep(9); }; // hand-ending fold — jump straight to Result

  // Editing a street's actions invalidates whatever later streets recorded
  // off the old outcome (pot size, who's still live) and any fold
  // determination made from it — un-stick heroFolded so a re-edited action
  // isn't permanently treated as a fold (or vice versa), wipe the now-stale
  // downstream streets, and drop them back to their card-entry phase so
  // they get dealt fresh. No-op for fields that were already empty, so it's
  // safe to call on every action commit, not just true edits.
  const clearAfter = (street: 'preflop' | 'flop' | 'turn' | 'river') => {
    // Result-step picks (who won, villain cards) were made against the OLD
    // outcome too — e.g. Villain 2 was picked as the showdown winner, but
    // this edit now makes Villain 2 fold before showdown. Stale results are
    // worse than no results, so wipe them along with the downstream streets.
    set({ heroFolded: false, foldedOn: null, result: null, winner: null, villainMucked: false, villainHoleCards: {} });
    if (street === 'preflop') {
      set({ flopCards: [null, null, null], flopActions: [], flopComplete: false });
      setFlopPhase('cards');
    }
    if (street === 'preflop' || street === 'flop') {
      set({ turnCard: null, turnActions: [], turnComplete: false });
      setTurnPhase('cards');
    }
    if (street === 'preflop' || street === 'flop' || street === 'turn') {
      set({ riverCard: null, riverActions: [], riverComplete: false });
      setRiverPhase('cards');
    }
  };

  // Back steps one screen at a time — a street's own cards/action sub-phase
  // counts as a step in its own right so Back peels those off first before
  // moving to the previous street. Editing something after going back is
  // handled the same way it always is: committing a new action calls
  // clearAfter above, which invalidates whatever was built on top of it.
  const back = () => {
    animateAccordion();
    if (step === 6 && flopPhase === 'action')  { setFlopPhase('cards');  return; }
    if (step === 7 && turnPhase === 'action')  { setTurnPhase('cards');  return; }
    if (step === 7 && turnPhase === 'cards')   { setFlopPhase('action'); setStep(6); return; }
    if (step === 8 && riverPhase === 'action') { setRiverPhase('cards'); return; }
    if (step === 8 && riverPhase === 'cards')  { setTurnPhase('action'); setStep(7); return; }
    setStep(s => Math.max(1, s - 1));
  };

  // Reopen an earlier DONE section for editing (tapping anywhere on its
  // collapsed card, not just a pencil/checkmark) — walks backward one
  // logical screen at a time using the exact same transitions as pressing
  // Back repeatedly, so every section's active/done state stays consistent
  // instead of jumping straight to a step number and leaving a completed
  // street's sub-phase in whatever state it happened to be left at.
  const jumpToStep = (target: number) => {
    let s = step, fp = flopPhase, tp = turnPhase, rp = riverPhase;
    while (s > target) {
      if (s === 6 && fp === 'action')       { fp = 'cards'; continue; }
      else if (s === 7 && tp === 'action')  { tp = 'cards'; continue; }
      else if (s === 7 && tp === 'cards')   { s = 6; fp = 'action'; continue; }
      else if (s === 8 && rp === 'action')  { rp = 'cards'; continue; }
      else if (s === 8 && rp === 'cards')   { s = 7; tp = 'action'; continue; }
      s = Math.max(target, s - 1);
    }
    animateAccordion();
    setStep(s); setFlopPhase(fp); setTurnPhase(tp); setRiverPhase(rp);
  };

  const handleClose = () => {
    setDraft(INITIAL_DRAFT); setStep(1);
    setFlopPhase('cards'); setTurnPhase('cards'); setRiverPhase('cards');
    onClose();
  };
  const handleSave  = () => { onSave(draft); handleClose(); };

  // The X button (and Android's hardware back) must always ask before
  // throwing away whatever's been entered — works the same at every step
  // since it doesn't depend on any in-progress UI state.
  const confirmClose = () => {
    Alert.alert(
      'Discard this hand?',
      'Your progress will be lost',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: handleClose },
      ],
    );
  };

  // The hand is built top-to-bottom in real time — every time a new section
  // becomes active, scroll down to reveal it.
  useEffect(() => {
    const t = setTimeout(() => {
      if (step === 3) {
        // Positions is by far the tallest section (table diagram + hero and
        // villain selectors) — scrolling to the very end like every other
        // step does overshoots past its own "POSITIONS" label, cutting it
        // off at the top of the viewport instead of bringing the section
        // into view starting from its own top.
        scrollRef.current?.scrollTo({ y: Math.max(0, positionsY.current - 8), animated: true });
      } else {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [step, flopPhase, turnPhase, riverPhase]);

  // Progress bar always transitions smoothly to the new percentage —
  // never a hard jump — regardless of which direction step moved.
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: Math.min(1, (step - 1) / TOTAL_STEPS),
      duration: 400,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, // width isn't supported by the native driver
    }).start();
  }, [step, progressAnim]);

  // Nothing ever sits below the Notes field, so once the keyboard opens for
  // it (or the name field just above it) the fix is always the same: reveal
  // the bottom of the scroll content, which is exactly what's newly hidden
  // behind the keyboard.
  useEffect(() => {
    const sub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => scrollRef.current?.scrollToEnd({ animated: true }),
    );
    return () => sub.remove();
  }, []);

  // A street section only exists once it's actually been reached — either
  // it's the active step right now, or its *Complete flag says it was
  // finished earlier AND we haven't since navigated back before it (covers
  // normal advance, a fold jumping ahead, and tapping an earlier done
  // section to re-edit it without leaving a stale empty card on screen for
  // streets that are technically complete but currently behind `step`).
  const showFlop  = step === 6 || (draft.flopComplete  && step > 6);
  const showTurn  = step === 7 || (draft.turnComplete  && step > 7);
  const showRiver = step === 8 || (draft.riverComplete && step > 8);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={confirmClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <StepHeader step={step} onBack={back} onClose={confirmClose} />
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => Keyboard.dismiss()}>

            <AppearingSection>
              {step === 1 ? (
                <StepGameType draft={draft} set={set} onNext={next} />
              ) : (
                <SectionWrap title="Game Type" summary={draft.gameType === 'cash' ? 'Cash Game' : 'Tournament'} isDone onPress={() => jumpToStep(1)}>
                  {null}
                </SectionWrap>
              )}
            </AppearingSection>

            {step >= 2 && (
              <AppearingSection>
                <View onLayout={(e) => { blindsY.current = e.nativeEvent.layout.y; }}>
                  <SectionWrap title="Blinds & Stack" summary={summaryGameSetup(draft)} isDone={step > 2} onPress={() => jumpToStep(2)}>
                    {step === 2 && <StepBlinds draft={draft} set={set} onNext={next} onFieldFocus={scrollToBlindsSoon} />}
                  </SectionWrap>
                </View>
              </AppearingSection>
            )}

            {step >= 3 && (
              <AppearingSection>
                <View onLayout={(e) => { positionsY.current = e.nativeEvent.layout.y; }}>
                  <SectionWrap title="Positions" summary={summaryPosition(draft)} isDone={step > 3} onPress={() => jumpToStep(3)}>
                    {step === 3 && <StepPosition draft={draft} set={set} onNext={next} />}
                  </SectionWrap>
                </View>
              </AppearingSection>
            )}

            {step >= 4 && (
              <AppearingSection>
                <SectionWrap title="Hole Cards" summary={summaryCards(draft)} isDone={step > 4} onPress={() => jumpToStep(4)}>
                  {step === 4 && <StepCards draft={draft} set={set} onNext={next} onSkip={next} />}
                </SectionWrap>
              </AppearingSection>
            )}

            {step >= 5 && (
              <AppearingSection>
                <SectionWrap title="Preflop" summary={summaryPreflop(draft)} isDone={step > 5} divider onPress={() => jumpToStep(5)}>
                  {step === 5 && (
                    <StepPreflop draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('preflop')}
                      onSizingOpen={scrollToEndSoon} />
                  )}
                </SectionWrap>
              </AppearingSection>
            )}

            {showFlop && (
              <AppearingSection>
                <SectionWrap title="Flop" summary={summaryStreet('flop', draft)} isDone={step > 6} divider onPress={() => jumpToStep(6)}>
                  {step === 6 && (
                    <StepStreet street="flop" phase={flopPhase} onPhaseChange={(p) => { animateAccordion(); setFlopPhase(p); }}
                      draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('flop')}
                      onSizingOpen={scrollToEndSoon} />
                  )}
                </SectionWrap>
              </AppearingSection>
            )}

            {showTurn && (
              <AppearingSection>
                <SectionWrap title="Turn" summary={summaryStreet('turn', draft)} isDone={step > 7} divider onPress={() => jumpToStep(7)}>
                  {step === 7 && (
                    <StepStreet street="turn" phase={turnPhase} onPhaseChange={(p) => { animateAccordion(); setTurnPhase(p); }}
                      draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('turn')}
                      onSizingOpen={scrollToEndSoon} />
                  )}
                </SectionWrap>
              </AppearingSection>
            )}

            {showRiver && (
              <AppearingSection>
                <SectionWrap title="River" summary={summaryStreet('river', draft)} isDone={step > 8} divider onPress={() => jumpToStep(8)}>
                  {step === 8 && (
                    <StepStreet street="river" phase={riverPhase} onPhaseChange={(p) => { animateAccordion(); setRiverPhase(p); }}
                      draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('river')}
                      onSizingOpen={scrollToEndSoon} />
                  )}
                </SectionWrap>
              </AppearingSection>
            )}

            {step >= 9 && (
              <AppearingSection>
                <SectionWrap title="Result" summary={summaryResult(draft)} isDone={step > 9} onPress={() => jumpToStep(9)}>
                  {step === 9 && <StepResult draft={draft} set={set} onNext={next} />}
                </SectionWrap>
              </AppearingSection>
            )}

            {step >= 10 && (
              <AppearingSection>
                <View>
                  <Text style={styles.sectionLabel}>Tag &amp; Save</Text>
                  <View style={[styles.sectionCard, styles.sectionCardActive]}>
                    <StepNameTag draft={draft} set={set} onNext={next} onSave={handleSave}
                      onFocusScroll={scrollToEndSoon} onOpenShareSheet={openShareSheet} sharingImage={sharingImage} />
                  </View>
                </View>
              </AppearingSection>
            )}
          </ScrollView>

          {/* Off-screen — outside the ScrollView so it's never clipped —
              captured for the share image, never shown to the user as a
              preview anywhere. Non-animated and always mounted once a game
              type is chosen, so it's already laid out by the time Share is
              tapped instead of racing a fade-in. */}
          {draft.gameType && (
            <View pointerEvents="none" style={styles.hiddenCardHost}>
              {/* No width/height override — react-native-view-shot's default
                  capture is already in real device pixels (it multiplies by
                  the native screen scale internally on both platforms),
                  which is the sharpest this library can produce. Its own
                  README warns that forcing width/height "might affect image
                  quality" (it resamples the bitmap) — there's no separate
                  pixelRatio option to bump instead, so leaving these unset
                  is what actually maximizes sharpness here. */}
              <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                <HandHistoryCard draft={draft} now={new Date()} hideVillainCards={hideVillainCards} />
              </ViewShot>
            </View>
          )}

          {/* Share confirm sheet — the only place the villain-cards toggle
              is ever shown, and only right before actually sharing. */}
          <Modal visible={shareSheetOpen} transparent animationType="fade" onRequestClose={() => setShareSheetOpen(false)}>
            <View style={styles.sheetOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShareSheetOpen(false)} />
              <View style={styles.sheetPanel}>
                <Text style={styles.sheetTitle}>Share Hand</Text>
                <VillainCardsToggle value={hideVillainCards} onToggle={() => setHideVillainCards(v => !v)} />
                <View style={styles.sheetActions}>
                  <Pressable onPress={() => setShareSheetOpen(false)} style={styles.sheetCancelBtn}>
                    <Text style={styles.sheetCancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={confirmShareImage} style={styles.sheetShareBtn} disabled={sharingImage}>
                    <Text style={styles.sheetShareBtnText}>{sharingImage ? 'Preparing…' : 'Share'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header:      { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two, borderBottomWidth: 1, borderBottomColor: C.backgroundElement },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  // Step 1 only — plain left-title/right-action row, same shape as every
  // other top-level screen header in the app (e.g. the Hands tab).
  headerRowFlat:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleLarge: { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  headerSide:  { minWidth: 60, justifyContent: 'center' },
  headerSideRight: { alignItems: 'flex-end' },
  backBtn:     { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingRight: 8 },
  backIcon:    { fontSize: 24, color: C.tint, fontWeight: '300', lineHeight: 26 },
  backLabel:   { fontSize: 15, color: C.tint, fontWeight: '500' },
  // Touch target padded out to the 44x44 minimum without growing the icon
  // itself — the icon's fontSize is untouched, only the surrounding
  // Pressable box is bigger.
  closeBtn:    { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 12 },
  closeIcon:   { fontSize: 15, color: C.textSecondary, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: 60, gap: 8 },

  progressTrack: { height: 3, marginHorizontal: Spacing.four, marginTop: Spacing.two, backgroundColor: C.backgroundElement, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: HERO_COLOR, borderRadius: 2 },

  // Accordion section shell — a persistent small-caps label sits above
  // every card. A done card collapses to one tappable summary row with a
  // checkmark + edit pencil; the active card gets a green left-border
  // accent and shows the section's fully expanded, live-editable body.
  // The accent itself is an absolutely-positioned bar (see sectionAccentBar)
  // rather than a real border, so its opacity can animate independently —
  // paddingLeft reserves its width permanently so nothing shifts.
  sectionBody:   { gap: 14 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6, marginLeft: 2 },
  // Bolder "crossing a boundary" treatment for preflop/flop/turn/river.
  streetDividerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8 },
  streetDividerLine:  { flex: 1, height: 1, backgroundColor: C.backgroundSelected },
  streetDividerLabel: { fontSize: 13, fontWeight: '800', color: HERO_COLOR, textTransform: 'uppercase', letterSpacing: 1.4 },
  sectionCard:   { backgroundColor: C.backgroundElement, borderRadius: 10, paddingVertical: 14, paddingRight: 14, paddingLeft: 17, position: 'relative', overflow: 'hidden' },
  sectionCardActive: { gap: 14 },
  sectionCardDone:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionAccentBar:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: HERO_COLOR },
  sectionGreyBar:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.backgroundSelected },
  sectionDoneSummary: { fontSize: 14, fontWeight: '600', color: C.text },
  sectionCheckmark:   { fontSize: 15, fontWeight: '700', color: HERO_COLOR },

  label:     { fontSize: 11, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },
  fieldLabel:{ fontSize: 12, fontWeight: '600', color: C.textSecondary },

  // Every selectable option is a clearly outlined box — filled green with
  // cream text when chosen, cream with a dark outline and dark text
  // otherwise. Nothing selectable should read as plain text.
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderRadius: 12, borderWidth: 1.5 },
  chipText:      { fontSize: 14, fontWeight: '700' },

  twoCol: { flexDirection: 'row', gap: 10 },

  numRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.backgroundElement, borderRadius: 12, overflow: 'hidden', paddingLeft: 10 },
  numInput: { flex: 1, fontSize: 20, fontWeight: '700', color: C.text, paddingVertical: 12, textAlign: 'center' },
  stackNote:{ fontSize: 12, color: C.textSecondary, textAlign: 'center', marginTop: -6 },

  // `overflow: 'hidden'` clipping a square-cornered filled child against a
  // rounded border is what left a hairline gap of the container's own
  // background showing through at the corners — glaring once the selected
  // segment fills solid green against it. Rounding the OUTER corners of the
  // end segments directly (instead of relying on clipping) draws them
  // correctly to begin with, so there's nothing left to clip.
  unitToggle:       { flexDirection: 'row', alignSelf: 'center', marginLeft: 8, marginVertical: 6, borderWidth: 1.5, borderColor: C.text, borderRadius: 10 },
  // Fixed `width`, not `minWidth` — a floor lets "Chips" (wider text) push
  // past "BB" and the two segments render at different widths, which is
  // what made the pill look lopsided/broken. A fixed width sized to the
  // longer label keeps both segments identical regardless of content.
  unitBtn:          { width: 64, paddingHorizontal: 8, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
  unitBtnFirst:     { borderTopLeftRadius: 8.5, borderBottomLeftRadius: 8.5 },
  unitBtnLast:      { borderTopRightRadius: 8.5, borderBottomRightRadius: 8.5 },
  unitBtnDivider:   { borderLeftWidth: 1.5, borderLeftColor: C.text },
  unitBtnText:      { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center' },
  unitBtnTextActive:{ color: C.tintText },

  nextBtn:        { backgroundColor: C.tint, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnOff:     { backgroundColor: C.backgroundElement },
  nextBtnText:    { fontSize: 16, fontWeight: '700', color: C.tintText },
  nextBtnTextOff: { color: C.textSecondary },
  skipBtn:        { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: 8 },
  skipBtnText:    { fontSize: 13, color: C.textSecondary, textDecorationLine: 'underline' },

  // Full-screen game type picker — plain cream background, two equal
  // bordered cards filling the screen (the heading lives in the top header
  // bar instead, see headerTitleLarge), and a Continue slot below them.
  // gap here must stay in sync with GAME_TYPE_GAP — both are used to size
  // the cards row (gameTypeScreen gets an explicit height computed from
  // this, not flex:1) so it never resizes when Continue fades in.
  gameTypeRoot:    { backgroundColor: C.background, gap: 16 },
  gameTypeScreen:  { gap: 12 },
  // Always rendered (never conditionally mounted) so its space is reserved
  // whether or not a card is selected — that's what stops the cards above
  // from shifting size the moment Continue becomes visible.
  gameTypeContinueSlot: { justifyContent: 'center' },
  // Same border color and weight on both cards — Cash vs Tournament reads
  // through the text only, not the outline.
  gameTypeBtn:           { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1B4332', borderRadius: 20 },
  gameTypeBtnText:       { fontSize: 26, fontWeight: '800' },

  selectorBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.backgroundElement, borderRadius: 14, padding: 14, gap: 12, borderWidth: 2, borderColor: 'transparent' },
  // Sits on top of a selector box, opacity-pulsed 3x to flag a missing
  // required field on a blocked Continue press — never rendered any other
  // time, so it starts fully transparent and costs nothing when idle.
  pulseOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 14, borderWidth: 3, borderColor: '#E8542E' },
  // Padded container so the static highlight border/fill has room to sit
  // around a Blinds-step input group without clipping its contents.
  highlightWrap: { position: 'relative', borderRadius: 14, padding: 8, margin: -8, gap: 14, borderWidth: 2, borderColor: 'transparent' },
  kbToolbar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.backgroundElement, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.backgroundSelected },
  kbToolbarBtn: { backgroundColor: HERO_COLOR, borderRadius: 18, paddingHorizontal: 22, paddingVertical: 9, minWidth: 92, alignItems: 'center' },
  kbToolbarBtnOff: { backgroundColor: C.backgroundSelected },
  kbToolbarBtnPressed: { opacity: 0.85 },
  kbToolbarText: { fontSize: 15, fontWeight: '700', color: '#F5F0E8' },
  kbToolbarTextOff: { color: C.textSecondary },
  selectorDot:  { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  selectorTitle:{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  selectorSeat: { fontSize: 16, fontWeight: '700', color: C.text },
  selectorArrow:{ fontSize: 20, color: C.textSecondary, fontWeight: '300' },
  vstackLabel:  { fontSize: 12, fontWeight: '600', color: C.textSecondary, width: 58 },
  villainNameInput: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text, backgroundColor: C.backgroundElement, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  addVillainBtn:{ borderRadius: 14, borderWidth: 1.5, borderColor: C.backgroundSelected, borderStyle: 'dashed', padding: 16, alignItems: 'center' },
  addVillainText:{ fontSize: 15, fontWeight: '700', color: C.textSecondary },
  removeBtn:    { width: 38, height: 38, borderRadius: 10, backgroundColor: '#FEE8E8', alignItems: 'center', justifyContent: 'center' },
  removeBtnText:{ fontSize: 16, color: '#C04040', fontWeight: '700' },
  summaryBox:   { backgroundColor: C.backgroundElement, borderRadius: 10, padding: 12, alignItems: 'center' },
  summaryText:  { fontSize: 15, fontWeight: '700', color: C.text },

  ctxStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.backgroundElement, borderRadius: 12, padding: 10 },
  ctxSep:   { width: 12, height: 1, backgroundColor: C.backgroundSelected },
  ctxText:  { fontSize: 12, color: C.textSecondary, fontWeight: '500', marginLeft: 4, flex: 1 },

  stackBar:    { flexDirection: 'row', gap: 12, backgroundColor: C.backgroundElement, borderRadius: 10, padding: 8 },
  stackBarItem:{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  stackBarDot: { width: 8, height: 8, borderRadius: 4 },
  stackBarLabel:{ fontSize: 11, fontWeight: '600', color: C.textSecondary },
  stackBarVal: { fontSize: 11, fontWeight: '700', color: C.text, marginLeft: 2 },

  tabRow:      { flexDirection: 'row', gap: 3, paddingVertical: 2 },
  posTab:      { paddingHorizontal: 2, paddingVertical: 7, borderRadius: 8, backgroundColor: C.backgroundElement, alignItems: 'center', gap: 2, borderWidth: 1.5, borderColor: 'transparent' },
  posTabFolded:  { opacity: 0.4 },
  posTabAllin:   { backgroundColor: 'rgba(200,148,10,0.22)', borderColor: '#C8940A', borderWidth: 2 },

  sidePotRow:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  sidePotChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(200,148,10,0.10)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(200,148,10,0.35)' },
  sidePotLabel: { fontSize: 10, fontWeight: '700', color: '#8A6A00', textTransform: 'uppercase', letterSpacing: 0.4 },
  sidePotAmt:   { fontSize: 12, fontWeight: '800', color: '#5A4400' },
  sidePotElig:  { fontSize: 10, fontWeight: '600', color: '#6B5020' },
  posTabLabel:   { fontSize: 10, fontWeight: '700', color: C.text, width: '100%', textAlign: 'center' },
  posTabIcon:    { fontSize: 9, fontWeight: '700', width: '100%', textAlign: 'center' },
  posTabAmount:  { fontSize: 7, fontWeight: '600', width: '100%', textAlign: 'center' },
  tableInstruction: { fontSize: 12, color: C.textSecondary, fontWeight: '500', marginTop: 6 },

  actionList:     { gap: 5 },
  actionRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 12, backgroundColor: C.backgroundElement, borderRadius: 11, gap: 10 },
  actionRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  actorDot:       { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  actorLabel:     { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  actionBadge:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  actionBadgeText:{ fontSize: 12, fontWeight: '700' },

  actionInput:       { borderWidth: 2, borderRadius: 16, padding: 14, gap: 10, marginTop: 2 },
  turnLabel: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center' },
  actionBtnsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Each action gets a clear outlined box (colored per its semantic meaning
  // in ACTION_COLORS), not just a filled chip — the border stays visible
  // even when not pressed or pre-selected.
  actionBtn:         { paddingHorizontal: 12, paddingVertical: 12, minHeight: 48, justifyContent: 'center', borderRadius: 10, minWidth: '44%', flexGrow: 1, alignItems: 'center', backgroundColor: C.backgroundElement, borderWidth: 1.5, borderColor: C.backgroundSelected },
  actionBtnText:     { fontSize: 14, fontWeight: '700', color: C.text },

  sizeChip:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.backgroundElement, alignItems: 'center', minWidth: 70, gap: 1, borderWidth: 1.5, borderColor: C.backgroundSelected },
  sizeChipLabel:{ fontSize: 12, fontWeight: '700', color: C.text },
  sizeChipAmt: { fontSize: 10, fontWeight: '600', color: C.textSecondary },

  manualRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualInput: { flex: 1, backgroundColor: C.backgroundElement, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },

  confirmBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },


  potBadge:     { backgroundColor: C.backgroundElement, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  potBadgeText: { fontSize: 14, fontWeight: '700', color: C.tint },

  outcomeBanner: { borderRadius: 16, padding: 20, alignItems: 'center', gap: 4 },
  outcomeTitle:  { fontSize: 20, fontWeight: '800' },
  outcomeSub:    { fontSize: 14, color: C.textSecondary, fontWeight: '500' },
  shareBtn:        { borderWidth: 1.5, borderColor: C.tint, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  shareBtnText:    { fontSize: 14, fontWeight: '700', color: C.tint },
  shareTextLink:     { alignItems: 'center', paddingVertical: 6 },
  shareTextLinkText: { fontSize: 12, fontWeight: '600', color: C.textSecondary, textDecorationLine: 'underline' },

  // Rendered off-screen purely so react-native-view-shot has real, laid-out
  // dimensions to capture — never visible to the user.
  hiddenCardHost: { position: 'absolute', top: 0, left: -3000 },

  // Share confirm sheet
  sheetOverlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetPanel:        { backgroundColor: C.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.four, paddingBottom: Spacing.six, gap: 16 },
  sheetTitle:        { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center' },
  sheetActions:      { flexDirection: 'row', gap: 10 },
  sheetCancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: C.backgroundElement },
  sheetCancelBtnText:{ fontSize: 14, fontWeight: '700', color: C.textSecondary },
  sheetShareBtn:     { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: C.tint },
  sheetShareBtnText: { fontSize: 14, fontWeight: '700', color: C.tintText },

  villainCardSection: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 10 },
  villainCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  villainCardTitle:   { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  confirmCardBtn:     { marginTop: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: C.tint, alignItems: 'center' },
  confirmCardBtnText: { fontSize: 14, fontWeight: '700', color: C.tintText },

  nameInput:      { backgroundColor: C.backgroundElement, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '600', color: C.text },
  nameHint:       { fontSize: 11, color: C.textSecondary, marginTop: -6 },
  notesInput:     { backgroundColor: C.backgroundElement, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text, minHeight: 80, textAlignVertical: 'top' },
  doneLinkWrap:   { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 2 },
  doneLinkText:   { fontSize: 13, fontWeight: '600', color: C.tint },
  saveBtn:        { backgroundColor: C.tint, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  saveBtnText:    { fontSize: 18, fontWeight: '800', color: C.tintText },
});
