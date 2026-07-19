import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { CardFace, CardPicker } from './card-picker';
import { TableDiagram } from './table-diagram';
import {
  ActionEntry,
  AnyAction,
  AnteType,
  CardType,
  HandDraft,
  INITIAL_DRAFT,
  POSITION_LABELS,
  Rank,
  ResultType,
  TagType,
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
} from './types';

const C = Colors.light;
const VILLAIN_COLORS = ['#C04040', '#D4683A', '#C8942A'];
const HERO_COLOR     = '#1B4332';
const UNNAMED_COLOR  = '#8A7A6A';

const ACTION_COLORS: Record<string, string> = {
  check: '#2E7D52', call: '#2E7D52', bet: '#1565C0',
  raise: '#C04040', allin: '#C04040', fold: '#888',
};

function DoneLink() {
  return (
    <Pressable onPress={() => Keyboard.dismiss()} style={styles.doneLinkWrap} hitSlop={8}>
      <Text style={styles.doneLinkText}>Done</Text>
    </Pressable>
  );
}

function fmtSize(n: number): string {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
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

// Returns true when ≤1 active (non-folded) player can still bet entering this street.
// This covers: both all-in preflop, one all-in + other called, etc.
function shouldSkipStreetAction(
  draft: HandDraft,
  street: 'flop' | 'turn' | 'river',
  actingOrder: string[],  // named non-preflop-folded actors
): boolean {
  const sbBB   = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradBB= draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const ao     = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const initInv= buildPreflopInvestments(ao, sbBB, stradBB, draft.playerCount);
  const pf     = computePreflopState(draft.preflopActions, sbBB, stradBB, initInv);

  // Live entering flop = those not folded or all-in preflop
  const liveAfterPf = actingOrder.filter(a => !pf.allInActors.has(a) && !pf.foldedActors.has(a));
  if (liveAfterPf.length <= 1) return true;
  if (street === 'flop') return false;

  const basePot = pf.potBB;
  const flopSt  = computeStreetState(draft.flopActions, basePot);
  const liveAfterFlop = liveAfterPf.filter(a => !flopSt.allInActors.has(a) && !flopSt.foldedActors.has(a));
  if (liveAfterFlop.length <= 1) return true;
  if (street === 'turn') return false;

  const turnSt = computeStreetState(draft.turnActions, flopSt.potBB);
  const liveAfterTurn = liveAfterFlop.filter(a => !turnSt.allInActors.has(a) && !turnSt.foldedActors.has(a));
  return liveAfterTurn.length <= 1;
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function NextBtn({ onPress, disabled, label = 'Continue' }: { onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.nextBtn, disabled && styles.nextBtnOff, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.nextBtnText, disabled && styles.nextBtnTextOff]}>{label}</Text>
    </Pressable>
  );
}

function SkipBtn({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}>
      <Text style={styles.skipBtnText}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function UnitToggle({ unit, onPress, accent }: { unit: 'BB' | 'Chips'; onPress: (u: 'BB' | 'Chips') => void; accent?: string }) {
  return (
    <View style={styles.unitToggle}>
      {(['BB', 'Chips'] as const).map(u => (
        <Pressable key={u} onPress={() => onPress(u)}
          style={[styles.unitBtn, unit === u && { backgroundColor: accent ?? C.tint }]}>
          <Text style={[styles.unitBtnText, unit === u && styles.unitBtnTextActive]}>{u}</Text>
        </Pressable>
      ))}
    </View>
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

function ActionRow({ playerLabel, dotColor, entry }: { playerLabel: string; dotColor: string; entry: ActionEntry }) {
  const color = ACTION_COLORS[entry.action] ?? '#999';
  return (
    <View style={styles.actionRow}>
      <View style={styles.actionRowLeft}>
        <View style={[styles.actorDot, { backgroundColor: dotColor }]} />
        <Text style={styles.actorLabel} numberOfLines={1}>{playerLabel}</Text>
      </View>
      <View style={[styles.actionBadge, { borderColor: color }]}>
        <Text style={[styles.actionBadgeText, { color }]}>{fmtActionLabel(entry)}</Text>
      </View>
    </View>
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
    if (a === 'hero') return labels[draft.heroSeat ?? 0] ?? 'Hero';
    if (a.startsWith('villain')) { const vi = parseInt(a.replace('villain',''),10)-1; return labels[draft.villainSeats[vi]??0] ?? `V${vi+1}`; }
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

// ── Action Input ──────────────────────────────────────────────────────────────

interface ActionInputProps {
  actor: string;
  posLabel: string;
  currentBetBB: number;
  potBB: number;
  stackBB: number;
  minRaiseBB: number;
  investedBB: number;
  isPreflop: boolean;
  bigBlind: number;
  canRaise?: boolean;
  preSelectedAction?: AnyAction;
  initialSizingBB?: number;
  onConfirm: (action: AnyAction, sizingBB: number) => void;
  onSizingChange?: (sizeBB: number | null) => void;
}

function ActionInput({
  actor, posLabel, currentBetBB, potBB, stackBB, minRaiseBB,
  investedBB, isPreflop, bigBlind, canRaise = true,
  preSelectedAction, initialSizingBB, onConfirm, onSizingChange,
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

  const displaySizing = sizeUnit === 'Chips' && bigBlind > 0
    ? `${fmtSize(effectiveSizing * bigBlind)} chips`
    : `${fmtSize(effectiveSizing)}BB`;

  const updateSizing = (bb: number) => { setSizingBB(bb); onSizingChange?.(bb); };

  const commitSizing = () => {
    const sz = Math.max(1, fullStack > 0 ? Math.min(fullStack, effectiveSizing) : effectiveSizing);
    onConfirm(raiseAction, sz);
    setShowSizing(false); setTypedText('');
    onSizingChange?.(null);
  };

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
  const actorTitle= isHero ? `Hero · ${posLabel}` : isVillain ? `Villain ${vi + 1} · ${posLabel}` : posLabel;
  const preBtn = (a: AnyAction) => preSelectedAction === a ? { borderWidth: 2, borderColor: accent } : {};

  return (
    <View style={[styles.actionInput, { borderColor: accent }]}>
      <View style={styles.actionInputHeader}>
        <View style={[styles.actorDot, { backgroundColor: accent }]} />
        <Text style={[styles.actionInputTitle, { color: accent }]}>{actorTitle}</Text>
      </View>

      <View style={styles.actionBtnsRow}>
        <Pressable onPress={() => quickCommit('fold')}
          style={({ pressed }) => [styles.actionBtn, { backgroundColor: pressed ? '#C04040' : '#FEE8E8' }, preBtn('fold')]}>
          <Text style={[styles.actionBtnText, { color: '#C04040' }]}>Fold</Text>
        </Pressable>

        {callAmt <= 0
          ? <Pressable onPress={() => quickCommit('check')}
              style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: '#2E7D52' }, preBtn('check')]}>
              <Text style={styles.actionBtnText}>Check</Text>
            </Pressable>
          : <Pressable onPress={() => quickCommit('call')}
              style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: '#2E7D52' }, preBtn('call')]}>
              <Text style={styles.actionBtnText}>
                {isCallAllin ? `Call All-In ${fmtSize(fullStack)}BB` : `Call ${fmtSize(callAmt)}BB`}
              </Text>
            </Pressable>
        }

        {canRaise && (
          <Pressable onPress={openSizing}
            style={({ pressed }) => [styles.actionBtn, showSizing && { backgroundColor: accent }, pressed && { opacity: 0.75 }, preBtn('raise'), preBtn('bet')]}>
            <Text style={[styles.actionBtnText, showSizing && { color: '#fff' }]}>{raiseLabel}</Text>
          </Pressable>
        )}

        <Pressable onPress={() => quickCommit('allin')}
          style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: '#C04040' }, preBtn('allin')]}>
          <Text style={styles.actionBtnText}>All-In</Text>
        </Pressable>
      </View>

      {showSizing && (
        <View style={{ gap: 8, marginTop: 2 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {presets.map(({ label, sizeBB }) => {
              const dispAmt = sizeUnit === 'Chips' && bigBlind > 0 ? fmtSize(sizeBB * bigBlind) : `${fmtSize(sizeBB)}BB`;
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
            />
            <UnitToggle unit={sizeUnit} onPress={handleUnit} accent={accent} />
          </View>

          <Pressable onPress={commitSizing}
            style={({ pressed }) => [styles.confirmBtn, { backgroundColor: accent }, pressed && { opacity: 0.8 }]}>
            <Text style={styles.confirmBtnText}>Confirm {raiseAction === 'raise' ? '↑ Raise' : 'Bet'} {displaySizing}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Header (single scrolling screen — no per-step wizard chrome) ──────────────

const TOTAL_STEPS = 9;

function ModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Log a Hand</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
            <Text style={styles.headerDoneText}>Done</Text>
          </Pressable>
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

// ── Step 1: Game Setup (type + blinds + stack, one section) ───────────────────

const CASH_PRESETS = [
  { label: '$1/$2', sb: 1, bb: 2 }, { label: '$1/$3', sb: 1, bb: 3 },
  { label: '$2/$5', sb: 2, bb: 5 }, { label: '$5/$10', sb: 5, bb: 10 },
];

function StepGameSetup({ draft, set, onNext }: StepProps) {
  const isCash = draft.gameType === 'cash';

  const pickType = (type: 'cash' | 'tournament') => {
    if (type === draft.gameType) return;
    if (type === 'cash') {
      set({ gameType: 'cash', stackUnit: '$', bigBlind: INITIAL_DRAFT.cashBB, smallBlind: INITIAL_DRAFT.cashSB });
    } else {
      set({ gameType: 'tournament', stackUnit: 'Chips', bigBlind: INITIAL_DRAFT.tournamentBB, smallBlind: INITIAL_DRAFT.tournamentSB });
    }
  };
  const [stackUnit, setStackUnit] = useState<'BB' | 'Chips'>('BB');
  const [stackText, setStackText] = useState('');
  const stackFocused = useRef(false);

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
    return stackUnit === 'BB'
      ? `= ${fmtSize(draft.effectiveStack * draft.bigBlind)} ${isCash ? '$' : 'chips'}`
      : `= ${fmtSize(draft.effectiveStack)} BB`;
  };

  const isOther = isCash && !CASH_PRESETS.find(p => p.label === draft.stakes);

  return (
    <StepScroll>
      <Label text="Game type" />
      <View style={styles.chipRow}>
        <Chip label="Cash Game" active={draft.gameType === 'cash'} onPress={() => pickType('cash')} />
        <Chip label="Tournament" active={draft.gameType === 'tournament'} onPress={() => pickType('tournament')} />
      </View>

      {draft.gameType && (
      <>
      {isCash ? (
        <>
          <Label text="Stakes" />
          <View style={styles.chipRow}>
            {CASH_PRESETS.map(({ label, sb, bb }) => (
              <Chip key={label} label={label} active={draft.stakes === label}
                onPress={() => set({ stakes: label, cashSB: sb, cashBB: bb, bigBlind: bb, smallBlind: sb })} />
            ))}
            <Chip label="Other" active={isOther} onPress={() => set({ stakes: 'other' })} />
          </View>
          {isOther && (
            <View style={styles.twoCol}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Small Blind ($)</Text>
                <View style={styles.numRow}>
                  <TextInput style={styles.numInput} keyboardType="numeric" selectTextOnFocus
                    value={draft.cashSB > 0 ? String(draft.cashSB) : ''}
                    onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ cashSB: n, smallBlind: n }); }}
                    placeholder="1" placeholderTextColor={C.textSecondary} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Big Blind ($)</Text>
                <View style={styles.numRow}>
                  <TextInput style={styles.numInput} keyboardType="numeric" selectTextOnFocus
                    value={draft.cashBB > 0 ? String(draft.cashBB) : ''}
                    onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ cashBB: n, bigBlind: n }); }}
                    placeholder="2" placeholderTextColor={C.textSecondary} />
                </View>
              </View>
            </View>
          )}
          <Label text="Straddle" />
          <View style={styles.chipRow}>
            <Chip label="No Straddle" active={!draft.straddleEnabled}
              onPress={() => set({ straddleEnabled: false, straddleAmount: 0 })} />
            <Chip label="Straddle 2×" active={draft.straddleEnabled}
              onPress={() => set({ straddleEnabled: true, straddleAmount: draft.bigBlind * 2 })} />
          </View>
        </>
      ) : (
        <>
          <Label text="Blind level" />
          <View style={styles.twoCol}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.fieldLabel}>Small Blind (chips)</Text>
              <View style={styles.numRow}>
                <TextInput style={styles.numInput} keyboardType="numeric" selectTextOnFocus
                  value={draft.tournamentSB > 0 ? String(draft.tournamentSB) : ''}
                  onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ tournamentSB: n, smallBlind: n }); }}
                  placeholder="100" placeholderTextColor={C.textSecondary} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.fieldLabel}>Big Blind (chips)</Text>
              <View style={styles.numRow}>
                <TextInput style={styles.numInput} keyboardType="numeric" selectTextOnFocus
                  value={draft.tournamentBB > 0 ? String(draft.tournamentBB) : ''}
                  onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ tournamentBB: n, bigBlind: n, stakes: `${draft.tournamentSB}/${n}` }); }}
                  placeholder="200" placeholderTextColor={C.textSecondary} />
              </View>
            </View>
          </View>
          <Label text="Ante" />
          <View style={styles.chipRow}>
            {([['none', 'No Ante'], ['ante', 'Ante'], ['bbAnte', 'BB Ante']] as [AnteType, string][]).map(([key, lbl]) => (
              <Chip key={key} label={lbl} active={draft.anteType === key}
                onPress={() => set({ anteType: key, anteAmount: key === 'bbAnte' ? draft.tournamentBB : key === 'none' ? 0 : draft.anteAmount })} />
            ))}
          </View>
          {draft.anteType === 'ante' && (
            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Ante amount (chips)</Text>
              <View style={styles.numRow}>
                <TextInput style={styles.numInput} keyboardType="numeric" selectTextOnFocus
                  value={draft.anteAmount > 0 ? String(draft.anteAmount) : ''}
                  onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n)) set({ anteAmount: n }); }}
                  placeholder="25" placeholderTextColor={C.textSecondary} />
              </View>
            </View>
          )}
        </>
      )}

      <Label text="Players at table" />
      <View style={styles.chipRow}>
        {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <Chip key={n} label={String(n)} active={draft.playerCount === n} onPress={() => set({ playerCount: n })} />
        ))}
      </View>

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
          onBlur={() => { stackFocused.current = false; commitStack(stackText, stackUnit); }}
          placeholder={stackUnit === 'BB' ? '100' : String(Math.round((draft.bigBlind || 2) * 100))}
          placeholderTextColor={C.textSecondary}
        />
        <UnitToggle unit={stackUnit} onPress={handleUnitChange} />
      </View>
      {stackNote() ? <Text style={styles.stackNote}>{stackNote()}</Text> : null}

      <NextBtn onPress={onNext} disabled={draft.bigBlind <= 0 || draft.effectiveStack <= 0} />
      </>
      )}
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

  const handleSeat = (seatIdx: number) => {
    if (!mode) return;
    if (mode === 'hero') {
      set({ heroSeat: seatIdx, villainSeats: draft.villainSeats.filter(s => s !== seatIdx) });
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
    const stacks = { ...draft.villainStacksBB };
    delete stacks[`villain${i + 1}`];
    set({ villainSeats: draft.villainSeats.filter((_, idx) => idx !== i), villainStacksBB: stacks });
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
            <Text style={[styles.selectorTitle, { color: HERO_COLOR }]}>Hero</Text>
            <Text style={styles.selectorSeat}>{draft.heroSeat !== null ? labels[draft.heroSeat] ?? '?' : 'Tap to select seat'}</Text>
          </View>
          <Text style={[styles.selectorArrow, mode === 'hero' && { color: HERO_COLOR }]}>{mode === 'hero' ? '▲' : '›'}</Text>
        </Pressable>

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
                    <Text style={[styles.selectorTitle, { color }]}>Villain {i + 1}</Text>
                    <Text style={styles.selectorSeat}>{seat >= 0 ? (labels[seat] ?? '?') : 'Tap to select seat'}</Text>
                  </View>
                  <Text style={[styles.selectorArrow, isActive && { color }]}>{isActive ? '▲' : '›'}</Text>
                </Pressable>
                {draft.villainSeats.length > 1 && (
                  <Pressable onPress={() => removeVillain(i)}
                    style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </Pressable>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                <Text style={styles.vstackLabel}>V{i + 1} stack</Text>
                <View style={[styles.numRow, { flex: 1 }]}>
                  <TextInput style={styles.numInput} keyboardType="numeric" selectTextOnFocus
                    value={stackBB > 0 ? dispStack : ''}
                    onChangeText={(t) => {
                      const n = parseFloat(t);
                      if (!isNaN(n)) {
                        const bb = vStackUnit === 'Chips' && draft.bigBlind > 0 ? n / draft.bigBlind : n;
                        set({ villainStacksBB: { ...draft.villainStacksBB, [vKey]: bb } });
                      }
                    }}
                    placeholder={fmtSize(draft.effectiveStackBB || 100)} placeholderTextColor={C.textSecondary} />
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
      <NextBtn onPress={onNext} disabled={draft.heroSeat === null || !draft.villainSeats.some(s => s >= 0)} />
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
        onCardPicked={(i, c) => { i === 0 ? set({ card1: c }) : set({ card2: c }); }}
        onClear={(i) => i === 0 ? set({ card1: null }) : set({ card2: null })}
        onAllFilled={onNext}
        onPendingChange={setPending} />
      {/* Only needed if the user arrives here with both cards already picked
          (back navigation) — a fresh pick auto-advances via onAllFilled. */}
      {draft.card1 && draft.card2 && <NextBtn onPress={onNext} label="Continue" />}
      <SkipBtn onPress={guardedSkip} label="Skip — no card recording" />
    </StepScroll>
  );
}

// ── Step 5: Preflop ───────────────────────────────────────────────────────────

function StepPreflop({ draft, set, onNext, onFold, onEdit }: StepProps & { onFold: () => void; onEdit: () => void }) {
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
    if (a === 'hero') return `Hero · ${posLabelFor(a)}`;
    if (a.startsWith('villain')) { const vi = parseInt(a.replace('villain',''),10)-1; return `V${vi+1} · ${posLabelFor(a)}`; }
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

    // Only replace in-place when actor's entry is the last action (no one acted after them).
    // If others acted after (e.g., a re-raise), keep old action as history and append the
    // new response — computePreflopState handles multiple entries per actor correctly.
    const isLastEntry = lastActIdx === draft.preflopActions.length - 1;

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
        <Text style={styles.ctxText}>Preflop · {fmtSize(state.potBB)}BB pot</Text>
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
          const fmtTabAmt  = (sz: number) => showChips ? `${fmtSize(sz * draft.bigBlind)}` : `${fmtSize(sz)}BB`;
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
        <ActionInput
          actor={selectedActor}
          posLabel={posLabelFor(selectedActor)}
          currentBetBB={stateForSelected.currentBetBB}
          potBB={stateForSelected.potBB}
          stackBB={stackFor(selectedActor) - (stateForSelected.investedBB[selectedActor] ?? 0)}
          minRaiseBB={stateForSelected.minRaiseBB}
          investedBB={stateForSelected.investedBB[selectedActor] ?? 0}
          initialSizingBB={perActorSizings[selectedActor]}
          isPreflop
          bigBlind={draft.bigBlind}
          canRaise={canRaiseForSelected}
          preSelectedAction={preSelectedAction ?? undefined}
          onConfirm={doAction}
          onSizingChange={(sz) => {
            pendingSizingRef.current = sz;
            if (sz !== null) setPerActorSizings(prev => ({ ...prev, [selectedActor]: sz }));
          }}
        />
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

function StepStreet({ street, phase, onPhaseChange, draft, set, onNext, onFold, onEdit }: StepProps & { street: 'flop' | 'turn' | 'river'; phase: 'cards' | 'action'; onPhaseChange: (p: 'cards' | 'action') => void; onFold: () => void; onEdit: () => void }) {
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

  const usedCards: CardType[] = [
    draft.card1, draft.card2,
    ...(street !== 'flop' ? draft.flopCards : []),
    ...(street === 'river' ? [draft.turnCard] : []),
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
    if (a === 'hero') return labels[draft.heroSeat ?? 0] ?? 'Hero';
    if (a.startsWith('villain')) { const vi = parseInt(a.replace('villain',''),10)-1; return labels[draft.villainSeats[vi]??0] ?? `V${vi+1}`; }
    return '?';
  };
  const dotFor  = (a: string) => a === 'hero' ? HERO_COLOR : a.startsWith('villain') ? (VILLAIN_COLORS[parseInt(a.replace('villain',''),10)-1] ?? VILLAIN_COLORS[0]) : UNNAMED_COLOR;
  const nameFor = (a: string) => {
    if (a === 'hero') return `Hero · ${posLabelFor(a)}`;
    if (a.startsWith('villain')) { const vi = parseInt(a.replace('villain',''),10)-1; return `V${vi+1} · ${posLabelFor(a)}`; }
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
        {cardsReady && <NextBtn onPress={advance} label="Continue" />}
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
        <Text style={styles.ctxText}>{fmtSize(state.potBB)}BB</Text>
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
            <ActionInput
              actor={currentActor} posLabel={posLabelFor(currentActor)}
              currentBetBB={state.currentBetBB} potBB={state.potBB}
              stackBB={actorRemaining(currentActor)}
              minRaiseBB={state.minRaiseBB > 0 ? state.minRaiseBB : Math.max(1, state.currentBetBB * 2 || 2)}
              investedBB={state.investedBB[currentActor] ?? 0}
              isPreflop={false} bigBlind={draft.bigBlind}
              canRaise={canRaise}
              onConfirm={handleAction}
            />
          ) : bettingDone ? (
            <>
              <View style={styles.potBadge}><Text style={styles.potBadgeText}>Pot: {fmtSize(state.potBB)} BB</Text></View>
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

function buildHistory(draft: HandDraft): string {
  const labels  = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? (labels[draft.heroSeat] ?? '?') : '?';
  const nameFor = (a: string) => {
    if (a === 'hero') return `Hero(${heroPos})`;
    if (a.startsWith('villain')) { const vi=parseInt(a.replace('villain',''),10)-1; return `V${vi+1}(${labels[draft.villainSeats[vi]]??'?'})`; }
    return labels[parseInt(a.replace('seat_',''),10)] ?? a;
  };
  const fmtA = (a: ActionEntry) => {
    const n = nameFor(a.actor);
    switch (a.action) {
      case 'fold':  return `${n}: fold`;
      case 'check': return `${n}: check`;
      case 'call':  return `${n}: call ${fmtSize(a.sizingBB)}BB`;
      case 'bet':   return `${n}: bet ${fmtSize(a.sizingBB)}BB`;
      case 'raise': return `${n}: raise to ${fmtSize(a.sizingBB)}BB`;
      case 'allin': return `${n}: all-in ${fmtSize(a.sizingBB)}BB`;
      default:      return `${n}: ${a.action}`;
    }
  };
  const c1 = draft.card1 ? `${draft.card1.rank}${draft.card1.suit}` : '?';
  const c2 = draft.card2 ? `${draft.card2.rank}${draft.card2.suit}` : '?';
  const gameStr = draft.gameType === 'cash' ? `$${draft.smallBlind}/$${draft.bigBlind} NL Hold'em` : `${draft.smallBlind}/${draft.bigBlind} (Tournament)`;
  const lines = [
    `${gameStr} · ${draft.playerCount}-max · ${Math.round(draft.effectiveStackBB || draft.effectiveStack)}BB eff`,
    `Hero(${heroPos}): ${c1} ${c2}`, '',
    '── Preflop ─────────────────────',
    ...draft.preflopActions.map(a => '  ' + fmtA(a)),
    `  Pot: ${fmtSize(draft.preflopPotBB)}BB (${draft.potType})`,
  ];
  const basePot = draft.preflopPotBB > 0 ? draft.preflopPotBB : 1.5;
  if (draft.flopCards.some(Boolean)) {
    const fStr = draft.flopCards.filter(Boolean).map(c => `${c!.rank}${c!.suit}`).join(' ');
    const fEnd = computeStreetState(draft.flopActions, basePot).potBB;
    lines.push('', `── Flop: ${fStr} ──────────────`, ...draft.flopActions.map(a => '  ' + fmtA(a)));
    if (draft.flopActions.length) lines.push(`  Pot: ${fmtSize(fEnd)}BB`);
    if (draft.turnCard) {
      const tEnd = computeStreetState(draft.turnActions, fEnd).potBB;
      lines.push('', `── Turn: ${draft.turnCard.rank}${draft.turnCard.suit} ───────────────`, ...draft.turnActions.map(a => '  ' + fmtA(a)));
      if (draft.turnActions.length) lines.push(`  Pot: ${fmtSize(tEnd)}BB`);
      if (draft.riverCard) {
        const rEnd = computeStreetState(draft.riverActions, tEnd).potBB;
        lines.push('', `── River: ${draft.riverCard.rank}${draft.riverCard.suit} ──────────────`, ...draft.riverActions.map(a => '  ' + fmtA(a)));
        if (draft.riverActions.length) lines.push(`  Pot: ${fmtSize(rEnd)}BB`);
      }
    }
  }
  lines.push('', '── Result ──────────────────────');
  if (draft.heroFolded) lines.push('  Hero folded — Villain wins');
  else if (draft.villainMucked) lines.push('  Villain mucked — Hero wins');
  else {
    Object.entries(draft.villainHoleCards).forEach(([vKey, [c1, c2]]) => {
      if (c1 && c2) {
        const vi = parseInt(vKey.replace('villain',''),10) - 1;
        lines.push(`  ${nameFor(vKey)} showed: ${c1.rank}${c1.suit} ${c2.rank}${c2.suit}`);
      }
    });
  }
  if (draft.potSizeBB > 0) lines.push(`  Pot: ${fmtSize(draft.potSizeBB)}BB`);
  return lines.join('\n');
}

// ── Step 9: Result ────────────────────────────────────────────────────────────

function StepResult({ draft, set, onNext }: StepProps) {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];

  const namedVillains = draft.villainSeats.map((_, i) => `villain${i + 1}`);
  const allActs = [...draft.preflopActions, ...draft.flopActions, ...draft.turnActions, ...draft.riverActions];
  const villainFolded = namedVillains.some(v => allActs.some(a => a.actor === v && a.action === 'fold'));

  const situation: 'hero_folded' | 'villain_folded' | 'showdown' =
    draft.heroFolded ? 'hero_folded' : villainFolded ? 'villain_folded' : 'showdown';

  const basePot = draft.preflopPotBB > 0 ? draft.preflopPotBB : 1.5;
  const fEnd    = computeStreetState(draft.flopActions, basePot).potBB;
  const tEnd    = computeStreetState(draft.turnActions, fEnd).potBB;
  const rEnd    = computeStreetState(draft.riverActions, tEnd).potBB;
  const autoPot = Math.max(basePot, fEnd, tEnd, rEnd);

  const [showVillainCards, setShowVillainCards] = useState(false);
  const [villainSlots, setVillainSlots] = useState<Record<string, number>>({});
  const [confirmedVillains, setConfirmedVillains] = useState<Set<string>>(new Set());

  const dotFor = (a: string) => a === 'hero' ? HERO_COLOR : a.startsWith('villain') ? (VILLAIN_COLORS[parseInt(a.replace('villain',''),10)-1] ?? VILLAIN_COLORS[0]) : UNNAMED_COLOR;
  const nameFor = (a: string) => {
    if (a === 'hero') return `Hero · ${labels[draft.heroSeat??0]??'?'}`;
    if (a.startsWith('villain')) { const vi=parseInt(a.replace('villain',''),10)-1; return `V${vi+1} · ${labels[draft.villainSeats[vi]??0]??'?'}`; }
    return '?';
  };

  // Used cards for hole-card picker: hero cards + board cards + other villains' cards
  const boardUsedCards: CardType[] = [
    draft.card1, draft.card2,
    ...draft.flopCards,
    draft.turnCard,
    draft.riverCard,
  ].filter(Boolean) as CardType[];

  const history = buildHistory(draft);

  return (
    <StepScroll>
      {/* Outcome banner */}
      {situation === 'hero_folded' && (
        <View style={[styles.outcomeBanner, { backgroundColor: '#FEE8E8' }]}>
          <Text style={[styles.outcomeTitle, { color: '#C04040' }]}>You Folded</Text>
          <Text style={styles.outcomeSub}>{fmtSize(autoPot)}BB pot</Text>
        </View>
      )}
      {situation === 'villain_folded' && (
        <View style={[styles.outcomeBanner, { backgroundColor: '#E8F5EE' }]}>
          <Text style={[styles.outcomeTitle, { color: HERO_COLOR }]}>Villain Folded — You Win</Text>
          <Text style={styles.outcomeSub}>{fmtSize(autoPot)}BB pot</Text>
        </View>
      )}
      {situation === 'showdown' && (
        <View style={[styles.outcomeBanner, { backgroundColor: '#EEE8D8' }]}>
          <Text style={[styles.outcomeTitle, { color: '#6B5020' }]}>Showdown</Text>
          <Text style={styles.outcomeSub}>{fmtSize(autoPot)}BB pot</Text>
        </View>
      )}

      {/* Showdown villain card entry */}
      {situation === 'showdown' && !draft.villainMucked && (
        <>
          <Label text="Showdown" />
          <View style={{ gap: 8 }}>
            <Pressable onPress={() => { set({ villainMucked: true, potSizeBB: Math.round(autoPot) }); setShowVillainCards(false); }}
              style={({ pressed }) => [styles.showdownBtn, draft.villainMucked && { borderColor: HERO_COLOR }, pressed && { opacity: 0.7 }]}>
              <Text style={styles.showdownBtnText}>Villain Mucked — Hero Wins</Text>
            </Pressable>
            <Pressable onPress={() => setShowVillainCards(!showVillainCards)}
              style={({ pressed }) => [styles.showdownBtn, showVillainCards && { borderColor: '#C04040' }, pressed && { opacity: 0.7 }]}>
              <Text style={styles.showdownBtnText}>Villain Shows Cards</Text>
            </Pressable>
          </View>

          {showVillainCards && namedVillains.map((vKey, i) => {
            const color     = VILLAIN_COLORS[i] ?? VILLAIN_COLORS[0];
            const vLabel    = nameFor(vKey);
            const cards     = draft.villainHoleCards[vKey] ?? [null, null];
            const slot      = villainSlots[vKey] ?? 0;
            const isConfirmed = confirmedVillains.has(vKey);
            const bothPicked  = cards[0] !== null && cards[1] !== null;
            const otherVillainCards: CardType[] = namedVillains
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

          {showVillainCards && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Label text="Result" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => set({ result: 'won' })}
                  style={({ pressed }) => [styles.showdownBtn, { flex: 1 }, draft.result === 'won' && { borderColor: HERO_COLOR }, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.showdownBtnText}>Hero Won</Text>
                </Pressable>
                <Pressable onPress={() => set({ result: 'lost' })}
                  style={({ pressed }) => [styles.showdownBtn, { flex: 1 }, draft.result === 'lost' && { borderColor: '#C04040' }, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.showdownBtnText}>Hero Lost</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}

      {/* Hand summary */}
      <Label text="Hand summary" />
      <Text style={styles.streetHeader}>PREFLOP</Text>
      {draft.preflopActions.filter(e => e.actor === 'hero' || e.actor.startsWith('villain'))
        .map((e, i) => <ActionRow key={i} playerLabel={nameFor(e.actor)} dotColor={dotFor(e.actor)} entry={e} />)}
      {draft.preflopActions.filter(e => e.actor === 'hero' || e.actor.startsWith('villain')).length === 0 &&
        <Text style={styles.emptyStreet}>No preflop recorded</Text>}

      {draft.flopCards.some(Boolean) && (
        <>
          <Text style={styles.streetHeader}>FLOP  {draft.flopCards.filter(Boolean).map(c => `${c!.rank}${c!.suit}`).join(' ')}</Text>
          {draft.flopActions.map((e, i) => <ActionRow key={i} playerLabel={nameFor(e.actor)} dotColor={dotFor(e.actor)} entry={e} />)}
          {draft.flopActions.length === 0 && <Text style={styles.emptyStreet}>Checked through</Text>}
        </>
      )}
      {draft.turnCard && (
        <>
          <Text style={styles.streetHeader}>TURN  {draft.turnCard.rank}{draft.turnCard.suit}</Text>
          {draft.turnActions.map((e, i) => <ActionRow key={i} playerLabel={nameFor(e.actor)} dotColor={dotFor(e.actor)} entry={e} />)}
          {draft.turnActions.length === 0 && <Text style={styles.emptyStreet}>Checked through</Text>}
        </>
      )}
      {draft.riverCard && (
        <>
          <Text style={styles.streetHeader}>RIVER  {draft.riverCard.rank}{draft.riverCard.suit}</Text>
          {draft.riverActions.map((e, i) => <ActionRow key={i} playerLabel={nameFor(e.actor)} dotColor={dotFor(e.actor)} entry={e} />)}
          {draft.riverActions.length === 0 && <Text style={styles.emptyStreet}>Checked through</Text>}
        </>
      )}

      <Pressable onPress={() => Share.share({ message: history }).catch(() => {})}
        style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}>
        <Text style={styles.shareBtnText}>Share / Copy Hand History</Text>
      </Pressable>
      <NextBtn onPress={() => {
        const update: Partial<HandDraft> = { potSizeBB: Math.round(autoPot) };
        if (situation === 'villain_folded') update.result = 'won';
        else if (situation === 'hero_folded') update.result = 'lost';
        set(update);
        onNext();
      }} label="Continue" />
    </StepScroll>
  );
}

// ── Step 10: Name & Tag ───────────────────────────────────────────────────────

const TAGS: Array<{ key: TagType; label: string }> = [
  { key: 'review', label: 'Review Later' }, { key: 'good', label: 'Good Play' },
  { key: 'unsure', label: 'Unsure' },       { key: 'interesting', label: 'Interesting' },
];

function StepNameTag({ draft, set, onSave }: StepProps & { onSave: () => void }) {
  const auto = autoHandName(draft);
  return (
    <StepScroll>
      <Label text="Name this hand" />
      <TextInput style={styles.nameInput} placeholder={auto} placeholderTextColor={C.textSecondary}
        value={draft.handName} onChangeText={(v) => set({ handName: v })} maxLength={80} returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()} />
      <Text style={styles.nameHint}>Leave blank to auto-generate: "{auto}"</Text>
      <Label text="Mark as" />
      <View style={styles.tagGrid}>
        {TAGS.map(({ key, label }) => (
          <Pressable key={key} onPress={() => set({ tag: draft.tag === key ? null : key })}
            style={({ pressed }) => [styles.tagBtn, draft.tag === key && styles.tagBtnActive, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.tagLabel, draft.tag === key && styles.tagLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Label text="Notes" />
      <TextInput style={styles.notesInput} placeholder="Any thoughts on this hand…"
        placeholderTextColor={C.textSecondary} value={draft.notes}
        onChangeText={(v) => set({ notes: v })} multiline maxLength={300} />
      <DoneLink />
      <Pressable onPress={onSave} style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.8 }]}>
        <Text style={styles.saveBtnText}>Save Hand</Text>
      </Pressable>
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
  if (actor === 'hero') return labels[draft.heroSeat ?? 0] ?? 'Hero';
  if (actor.startsWith('villain')) {
    const vi = parseInt(actor.replace('villain', ''), 10) - 1;
    return labels[draft.villainSeats[vi] ?? 0] ?? `V${vi + 1}`;
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
  if (actions.length === 0) return board ? `${board} — checked through` : (board || 'Skipped');
  const parts = actions.map(e => `${abbrevPos(posLabelForActor(draft, e.actor))} ${fmtActionShort(e)}`);
  return `${board} — ${parts.join(' · ')}`;
}

function summaryResult(draft: HandDraft): string {
  if (draft.heroFolded) return 'Hero folded';
  if (draft.result === 'won') return draft.villainMucked ? 'Villain mucked — Hero wins' : 'Showdown — Hero wins';
  if (draft.result === 'lost') return 'Showdown — Hero loses';
  return 'Showdown';
}

interface SectionWrapProps {
  title: string;
  accent?: string;
  summary: string;
  isDone: boolean;
  onEdit: () => void;
  children: ReactNode;
}

// One accordion "row": a compact done-summary with an edit pencil, or the
// fully expanded, live-editable body when this is the active section.
function SectionWrap({ title, accent, summary, isDone, onEdit, children }: SectionWrapProps) {
  if (isDone) {
    return (
      <Pressable onPress={onEdit} style={({ pressed }) => [styles.sectionDone, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionDoneTitle}>{title}</Text>
          <Text style={styles.sectionDoneSummary} numberOfLines={1}>{summary}</Text>
        </View>
        <Text style={styles.sectionEditIcon}>✎</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.sectionActive}>
      <Text style={[styles.sectionActiveTitle, accent ? { color: accent } : null]}>{title}</Text>
      {children}
    </View>
  );
}

// ── Root modal ────────────────────────────────────────────────────────────────

export interface LogHandModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: HandDraft) => void;
}

// Fields owned by each accordion section, in section order (1-9) — used to
// cascade-reset everything downstream of a section being reopened for
// editing, since the hand data from that point on may no longer be valid.
const SECTION_FIELDS: Record<number, (keyof HandDraft)[]> = {
  1: ['gameType', 'cashSB', 'cashBB', 'stakes', 'tournamentSB', 'tournamentBB', 'bigBlind', 'smallBlind',
      'straddleEnabled', 'straddleAmount', 'anteType', 'anteAmount', 'playerCount',
      'effectiveStack', 'stackUnit', 'effectiveStackBB'],
  2: ['heroSeat', 'villainSeats', 'villainStacksBB'],
  3: ['card1', 'card2'],
  4: ['preflopActions', 'preflopComplete', 'potType', 'preflopPotBB'],
  5: ['flopCards', 'flopActions', 'flopComplete'],
  6: ['turnCard', 'turnActions', 'turnComplete'],
  7: ['riverCard', 'riverActions', 'riverComplete'],
  8: ['heroFolded', 'foldedOn', 'lastStreet', 'villainMucked', 'result', 'potSizeBB', 'villainHoleCards'],
  9: ['handName', 'tag', 'notes'],
};

export function LogHandModal({ visible, onClose, onSave }: LogHandModalProps) {
  const [step,  setStep]  = useState(1);
  const [draft, setDraft] = useState<HandDraft>(INITIAL_DRAFT);
  const [flopPhase,  setFlopPhase]  = useState<'cards' | 'action'>('cards');
  const [turnPhase,  setTurnPhase]  = useState<'cards' | 'action'>('cards');
  const [riverPhase, setRiverPhase] = useState<'cards' | 'action'>('cards');
  const scrollRef = useRef<ScrollView>(null);

  const set  = (u: Partial<HandDraft>) => setDraft(prev => ({ ...prev, ...u }));
  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const skip = () => setStep(8); // hand-ending fold — jump straight to Result

  // Editing a street's actions invalidates whatever later streets recorded
  // off the old outcome (pot size, who's still live) and any fold
  // determination made from it — un-stick heroFolded so a re-edited action
  // isn't permanently treated as a fold (or vice versa), wipe the now-stale
  // downstream streets, and drop them back to their card-entry phase so
  // they get dealt fresh. No-op for fields that were already empty, so it's
  // safe to call on every action commit, not just true edits.
  const clearAfter = (street: 'preflop' | 'flop' | 'turn' | 'river') => {
    set({ heroFolded: false, foldedOn: null });
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

  // Pencil-edit a completed section: reopen it, and wipe every section after
  // it, since a change here can invalidate all the hand data built on top.
  const editSection = (i: number) => {
    const resets: Partial<HandDraft> = {};
    for (let g = i + 1; g <= 9; g++) {
      for (const key of SECTION_FIELDS[g]) (resets as any)[key] = (INITIAL_DRAFT as any)[key];
    }
    setDraft(prev => ({ ...prev, ...resets }));
    setFlopPhase('cards'); setTurnPhase('cards'); setRiverPhase('cards');
    setStep(i);
  };

  const handleClose = () => {
    setDraft(INITIAL_DRAFT); setStep(1);
    setFlopPhase('cards'); setTurnPhase('cards'); setRiverPhase('cards');
    onClose();
  };
  const handleSave  = () => { onSave(draft); handleClose(); };

  // The hand is built top-to-bottom in real time — every time a new section
  // becomes active, scroll down to reveal it.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [step, flopPhase, turnPhase, riverPhase]);

  // A street section only exists once it's actually been reached — either
  // it's the active step right now, or its *Complete flag says it was
  // finished earlier (covers both normal advance and a fold jumping ahead).
  const showFlop  = draft.flopComplete  || step === 5;
  const showTurn  = draft.turnComplete  || step === 6;
  const showRiver = draft.riverComplete || step === 7;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <ModalHeader onClose={handleClose} />
          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => Keyboard.dismiss()}>

            <SectionWrap title="Game Setup" summary={summaryGameSetup(draft)} isDone={step > 1} onEdit={() => editSection(1)}>
              {step === 1 && <StepGameSetup draft={draft} set={set} onNext={next} />}
            </SectionWrap>

            {step >= 2 && (
              <SectionWrap title="Position" summary={summaryPosition(draft)} isDone={step > 2} onEdit={() => editSection(2)}>
                {step === 2 && <StepPosition draft={draft} set={set} onNext={next} />}
              </SectionWrap>
            )}

            {step >= 3 && (
              <SectionWrap title="Hole Cards" summary={summaryCards(draft)} isDone={step > 3} onEdit={() => editSection(3)}>
                {step === 3 && <StepCards draft={draft} set={set} onNext={next} onSkip={next} />}
              </SectionWrap>
            )}

            {step >= 4 && (
              <SectionWrap title="Preflop" summary={summaryPreflop(draft)} isDone={step > 4} onEdit={() => editSection(4)}>
                {step === 4 && (
                  <StepPreflop draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('preflop')} />
                )}
              </SectionWrap>
            )}

            {showFlop && (
              <SectionWrap title="Flop" summary={summaryStreet('flop', draft)} isDone={step > 5} onEdit={() => editSection(5)}>
                {step === 5 && (
                  <StepStreet street="flop" phase={flopPhase} onPhaseChange={setFlopPhase}
                    draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('flop')} />
                )}
              </SectionWrap>
            )}

            {showTurn && (
              <SectionWrap title="Turn" summary={summaryStreet('turn', draft)} isDone={step > 6} onEdit={() => editSection(6)}>
                {step === 6 && (
                  <StepStreet street="turn" phase={turnPhase} onPhaseChange={setTurnPhase}
                    draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('turn')} />
                )}
              </SectionWrap>
            )}

            {showRiver && (
              <SectionWrap title="River" summary={summaryStreet('river', draft)} isDone={step > 7} onEdit={() => editSection(7)}>
                {step === 7 && (
                  <StepStreet street="river" phase={riverPhase} onPhaseChange={setRiverPhase}
                    draft={draft} set={set} onNext={next} onFold={skip} onEdit={() => clearAfter('river')} />
                )}
              </SectionWrap>
            )}

            {step >= 8 && (
              <SectionWrap title="Result" summary={summaryResult(draft)} isDone={step > 8} onEdit={() => editSection(8)}>
                {step === 8 && <StepResult draft={draft} set={set} onNext={next} />}
              </SectionWrap>
            )}

            {step >= 9 && (
              <View style={styles.sectionActive}>
                <Text style={styles.sectionActiveTitle}>Tag &amp; Save</Text>
                <StepNameTag draft={draft} set={set} onNext={next} onSave={handleSave} />
              </View>
            )}
          </ScrollView>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 56, justifyContent: 'flex-end' },
  headerDoneText: { fontSize: 14, fontWeight: '600', color: C.tint },
  closeBtn:    { alignItems: 'flex-end' },
  closeIcon:   { fontSize: 15, color: C.textSecondary, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: 60, gap: 10 },

  // Accordion section shell — a done section collapses to one tappable
  // summary row; the active section gets a titled, fully expanded body.
  sectionBody:   { gap: 14 },
  sectionDone:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.backgroundElement, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  sectionDoneTitle:   { fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.7 },
  sectionDoneSummary: { fontSize: 14, fontWeight: '600', color: C.text, marginTop: 2 },
  sectionEditIcon:    { fontSize: 16, color: C.tint },
  sectionActive:      { gap: 14, borderRadius: 16, borderWidth: 1.5, borderColor: C.backgroundElement, padding: 14 },
  sectionActiveTitle: { fontSize: 13, fontWeight: '800', color: C.tint, textTransform: 'uppercase', letterSpacing: 0.7 },

  label:     { fontSize: 11, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },
  fieldLabel:{ fontSize: 12, fontWeight: '600', color: C.textSecondary },

  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: C.backgroundElement },
  chipActive:    { backgroundColor: C.tint },
  chipText:      { fontSize: 14, fontWeight: '700', color: C.text },
  chipTextActive:{ color: '#fff' },

  twoCol: { flexDirection: 'row', gap: 10 },

  numRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.backgroundElement, borderRadius: 12, overflow: 'hidden', paddingLeft: 10 },
  numInput: { flex: 1, fontSize: 20, fontWeight: '700', color: C.text, paddingVertical: 12, textAlign: 'center' },
  stackNote:{ fontSize: 12, color: C.textSecondary, textAlign: 'center', marginTop: -6 },

  unitToggle:       { flexDirection: 'column', borderLeftWidth: 1, borderLeftColor: C.backgroundSelected },
  unitBtn:          { paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', backgroundColor: C.backgroundElement },
  unitBtnText:      { fontSize: 11, fontWeight: '700', color: C.textSecondary },
  unitBtnTextActive:{ color: '#fff' },

  nextBtn:        { backgroundColor: C.tint, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnOff:     { backgroundColor: C.backgroundElement },
  nextBtnText:    { fontSize: 16, fontWeight: '700', color: C.tintText },
  nextBtnTextOff: { color: C.textSecondary },
  skipBtn:        { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: 8 },
  skipBtnText:    { fontSize: 13, color: C.textSecondary, textDecorationLine: 'underline' },

  gameBtn:         { flex: 1, maxHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 2, borderColor: C.backgroundElement, borderRadius: 20 },
  gameHalfIcon:    { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  gameHalfIconText:{ fontSize: 30, fontWeight: '900' },
  gameHalfTitle:   { fontSize: 24, fontWeight: '800', color: C.text },
  gameHalfDesc:    { fontSize: 14, color: C.textSecondary, textAlign: 'center' },

  selectorBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.backgroundElement, borderRadius: 14, padding: 14, gap: 12, borderWidth: 2, borderColor: 'transparent' },
  selectorDot:  { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  selectorTitle:{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  selectorSeat: { fontSize: 16, fontWeight: '700', color: C.text },
  selectorArrow:{ fontSize: 20, color: C.textSecondary, fontWeight: '300' },
  vstackLabel:  { fontSize: 12, fontWeight: '600', color: C.textSecondary, width: 58 },
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
  actionInputHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionInputTitle:  { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  actionBtnsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn:         { paddingHorizontal: 12, paddingVertical: 12, minHeight: 48, justifyContent: 'center', borderRadius: 10, minWidth: '44%', flexGrow: 1, alignItems: 'center', backgroundColor: C.backgroundElement },
  actionBtnText:     { fontSize: 14, fontWeight: '700', color: C.text },

  sizeChip:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.backgroundElement, alignItems: 'center', minWidth: 70, gap: 1 },
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
  showdownBtn:     { borderWidth: 1.5, borderColor: C.backgroundSelected, borderRadius: 14, padding: 16, alignItems: 'center' },
  showdownBtnText: { fontSize: 15, fontWeight: '700', color: C.text },
  streetHeader:    { fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.9, marginTop: 8, marginBottom: 2 },
  emptyStreet:     { fontSize: 12, color: C.textSecondary, fontStyle: 'italic', paddingLeft: 4 },
  shareBtn:        { borderWidth: 1.5, borderColor: C.tint, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  shareBtnText:    { fontSize: 14, fontWeight: '700', color: C.tint },

  villainCardSection: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 10 },
  villainCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  villainCardTitle:   { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  confirmCardBtn:     { marginTop: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: C.tint, alignItems: 'center' },
  confirmCardBtnText: { fontSize: 14, fontWeight: '700', color: C.tintText },

  nameInput:      { backgroundColor: C.backgroundElement, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '600', color: C.text },
  nameHint:       { fontSize: 11, color: C.textSecondary, marginTop: -6 },
  tagGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagBtn:         { flex: 1, minWidth: '44%', paddingVertical: 14, borderRadius: 14, backgroundColor: C.backgroundElement, alignItems: 'center' },
  tagBtnActive:   { backgroundColor: C.tint },
  tagLabel:       { fontSize: 13, fontWeight: '600', color: C.text },
  tagLabelActive: { color: C.tintText },
  notesInput:     { backgroundColor: C.backgroundElement, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text, minHeight: 80, textAlignVertical: 'top' },
  doneLinkWrap:   { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 2 },
  doneLinkText:   { fontSize: 13, fontWeight: '600', color: C.tint },
  saveBtn:        { backgroundColor: C.tint, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  saveBtnText:    { fontSize: 18, fontWeight: '800', color: C.tintText },
});
