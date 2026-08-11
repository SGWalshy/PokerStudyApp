import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
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
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';

import { Colors, Spacing } from '@/constants/theme';
import { useAppData } from '@/state/app-data';
import { Group } from '@/utils/groups-storage';
import { rankShowdown } from '@/utils/poker-hand-evaluator';
import { withTimeout } from '@/utils/promise-utils';
import { CardFace } from '../log-hand/card-picker';
import { HandHistoryCard, VillainCardsToggle } from '../log-hand/hand-history-card';
import {
  ActionEntry,
  AnyAction,
  CardType,
  POSITION_LABELS,
  autoHandName,
  computeFoldWinNet,
  computeHandMath,
  computeHandOutcome,
  fmtDualAmount,
  villainLabel,
  heroLabel,
} from '../log-hand/types';
import {
  ActionNote,
  FLAG_COLOR_PALETTE,
  Flag,
  HandRecord,
  HandReview,
  INITIAL_REVIEW,
  ReviewStatus,
  computeStatus,
} from './types';

const C = Colors.light;

// Notes input — near-white so the writable area reads as lighter than the
// card around it, with typed text a soft dark-grey and placeholder text
// lighter again, so the hierarchy reads empty-state → typed → emphasized.
const NOTE_INPUT_BG = '#FAF7F2';
const NOTE_PLACEHOLDER_COLOR = '#C8C0B0';
const NOTE_TEXT_COLOR = '#6A6A5A';

function DoneLink() {
  return (
    <Pressable onPress={() => Keyboard.dismiss()} style={styles.doneLinkWrap} hitSlop={8}>
      <Text style={styles.doneLinkText}>Done</Text>
    </Pressable>
  );
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const ACTION_PILL_COLOR: Record<string, string> = {
  fold:  '#888888',
  check: '#2E7D52',
  call:  '#2E7D52',
  bet:   '#1565C0',
  raise: '#C04040',
  allin: '#C04040',
};

// Every amount display in this screen goes through fmtDualAmount — a cash
// hand gets a $ sign, a tournament gets a bare (K/M-compact) number, both
// followed by the BB equivalent in brackets; never the word "chips".
type AmountOpts = Parameters<typeof fmtDualAmount>[1];

function actionLabel(action: AnyAction, sizingBB: number, amountOpts: AmountOpts): string {
  const fmt = (bb: number) => fmtDualAmount(bb, amountOpts);
  switch (action) {
    case 'fold':  return 'Folds';
    case 'check': return 'Checks';
    case 'call':  return sizingBB > 0 ? `Calls ${fmt(sizingBB)}` : 'Calls';
    case 'bet':   return `Bets ${fmt(sizingBB)}`;
    case 'raise': return `Raises to ${fmt(sizingBB)}`;
    case 'allin': return `All-In${sizingBB > 0 ? ` ${fmt(sizingBB)}` : ''}`;
    default:      return action;
  }
}

function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Primitive sub-components ─────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SubLabel({ text, mt }: { text: string; mt?: number }) {
  return <Text style={[styles.subLabel, mt ? { marginTop: mt } : undefined]}>{text}</Text>;
}

function ActionPill({ action }: { action: AnyAction }) {
  const color = ACTION_PILL_COLOR[action] ?? '#888';
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>
        {action === 'allin' ? 'ALL IN' : action.toUpperCase()}
      </Text>
    </View>
  );
}

function FlagTag({ label, color, onRemove }: { label: string; color: string; onRemove?: () => void }) {
  return (
    <View style={[styles.flagTag, { backgroundColor: color + '22', borderColor: color + '88' }]}>
      <Text style={[styles.flagTagText, { color }]}>{label}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={[styles.flagTagRemove, { color }]}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── NoteEditor ───────────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: string;
  flags: Flag[];
  placeholder: string;
  onNoteChange: (text: string) => void;
  onAddFlag: (flag: Flag) => void;
  onRemoveFlag: (index: number) => void;
}

function NoteEditor({ note, flags, placeholder, onNoteChange, onAddFlag, onRemoveFlag }: NoteEditorProps) {
  const [adding, setAdding] = useState(false);
  const [flagText, setFlagText] = useState('');
  const [flagColor, setFlagColor] = useState(FLAG_COLOR_PALETTE[0]);

  const submitFlag = () => {
    const t = flagText.trim();
    if (!t) return;
    onAddFlag({ label: t, color: flagColor });
    setFlagText('');
    setFlagColor(FLAG_COLOR_PALETTE[0]);
    setAdding(false);
  };

  return (
    <View style={styles.noteEditor}>
      <TextInput
        style={styles.noteInput}
        multiline
        value={note}
        onChangeText={onNoteChange}
        placeholder={placeholder}
        placeholderTextColor={NOTE_PLACEHOLDER_COLOR}
        textAlignVertical="top"
      />
      <DoneLink />

      {/* Active flags */}
      {flags.length > 0 && (
        <View style={styles.flagRow}>
          {flags.map((f, i) => (
            <FlagTag key={`${f.label}_${i}`} label={f.label} color={f.color} onRemove={() => onRemoveFlag(i)} />
          ))}
        </View>
      )}

      {adding ? (
        <View style={styles.addFlagForm}>
          <TextInput
            style={styles.customFlagInput}
            value={flagText}
            onChangeText={setFlagText}
            placeholder="Flag text…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="done"
            onSubmitEditing={submitFlag}
            autoFocus
          />
          <View style={styles.colorSwatchRow}>
            {FLAG_COLOR_PALETTE.map(c => (
              <Pressable key={c} onPress={() => setFlagColor(c)} hitSlop={4}
                style={[styles.colorSwatch, { backgroundColor: c }, flagColor === c && styles.colorSwatchActive]} />
            ))}
          </View>
          <View style={styles.addFlagFormActions}>
            <Pressable onPress={() => { setAdding(false); setFlagText(''); }} style={styles.flagCancelBtn}>
              <Text style={styles.flagCancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submitFlag} style={styles.customFlagAdd}>
              <Text style={styles.customFlagAddText}>Add</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={styles.addFlagBtn}>
          <Text style={styles.addFlagBtnText}>+ Add Flag</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── ReviewActionRow ──────────────────────────────────────────────────────────

interface ActionRowProps {
  actorLabel: string;
  dotColor:   string;
  entry:      ActionEntry;
  note:       ActionNote | undefined;
  isExpanded: boolean;
  amountOpts: AmountOpts;
  onToggle:   () => void;
  onNoteChange: (text: string) => void;
  onAddFlag:    (flag: Flag) => void;
  onRemoveFlag: (index: number) => void;
}

function ReviewActionRow({
  actorLabel, dotColor, entry, note, isExpanded,
  amountOpts, onToggle, onNoteChange, onAddFlag, onRemoveFlag,
}: ActionRowProps) {
  return (
    <View style={styles.actionRowWrap}>
      <Pressable onPress={onToggle} style={styles.actionRow}>
        <View style={styles.actionRowLeft}>
          <View style={[styles.actorDot, { backgroundColor: dotColor }]} />
          <Text style={styles.actorName}>{actorLabel}</Text>
          {(note?.flags.length ?? 0) > 0 && (
            <View style={styles.flagBadge}>
              <Text style={styles.flagBadgeText}>{note!.flags.length}</Text>
            </View>
          )}
        </View>
        <View style={styles.actionRowRight}>
          <Text style={styles.actionText}>{actionLabel(entry.action, entry.sizingBB, amountOpts)}</Text>
          <ActionPill action={entry.action} />
          <Text style={[styles.pencilIcon, isExpanded && styles.pencilIconActive]}>✎</Text>
        </View>
      </Pressable>

      {isExpanded && (
        <NoteEditor
          note={note?.note ?? ''}
          flags={note?.flags ?? []}
          placeholder="Add your thoughts on this action…"
          onNoteChange={onNoteChange}
          onAddFlag={onAddFlag}
          onRemoveFlag={onRemoveFlag}
        />
      )}
    </View>
  );
}

// ─── StreetSection ────────────────────────────────────────────────────────────

interface StreetSectionProps {
  street:      'preflop' | 'flop' | 'turn' | 'river';
  actions:     ActionEntry[];
  boardCards?: (CardType | null)[];
  review:      HandReview;
  expandedKey: string | null;
  amountOpts:  AmountOpts;
  actorLabel:  (actor: string) => string;
  actorDot:    (actor: string) => string;
  isNamed:     (actor: string) => boolean;
  onToggle:    (key: string) => void;
  onNoteChange: (key: string, text: string) => void;
  onAddFlag:    (key: string, flag: Flag) => void;
  onRemoveFlag: (key: string, index: number) => void;
}

function StreetSection({
  street, actions, boardCards, review, expandedKey,
  amountOpts, actorLabel, actorDot, isNamed,
  onToggle, onNoteChange, onAddFlag, onRemoveFlag,
}: StreetSectionProps) {
  const cap           = street.charAt(0).toUpperCase() + street.slice(1);
  const streetNoteKey = `street_${street}`;
  const streetNote    = review.streetNotes[streetNoteKey];
  const sNoteOpen     = expandedKey === streetNoteKey;

  const namedActions = actions.map((e, i) => ({ e, i })).filter(({ e }) => isNamed(e.actor));
  if (namedActions.length === 0 && !boardCards?.some(Boolean)) return null;

  return (
    <View style={styles.streetSection}>
      <View style={styles.streetHeader}>
        <Text style={styles.streetLabel}>{cap}</Text>
        {boardCards && boardCards.filter(Boolean).length > 0 && (
          <View style={styles.boardCards}>
            {boardCards.map((c, i) => <CardFace key={i} card={c} size="sm" />)}
          </View>
        )}
        {(streetNote?.flags.length ?? 0) > 0 && (
          <View style={[styles.flagBadge, { marginLeft: 'auto' as any }]}>
            <Text style={styles.flagBadgeText}>{streetNote!.flags.length}</Text>
          </View>
        )}
      </View>

      {namedActions.map(({ e, i }) => {
        const noteKey = `${street}_${i}`;
        return (
          <ReviewActionRow
            key={noteKey}
            actorLabel={actorLabel(e.actor)}
            dotColor={actorDot(e.actor)}
            entry={e}
            note={review.actionNotes[noteKey]}
            isExpanded={expandedKey === noteKey}
            amountOpts={amountOpts}
            onToggle={() => onToggle(noteKey)}
            onNoteChange={t => onNoteChange(noteKey, t)}
            onAddFlag={f => onAddFlag(noteKey, f)}
            onRemoveFlag={i => onRemoveFlag(noteKey, i)}
          />
        );
      })}

      <Pressable onPress={() => onToggle(streetNoteKey)} style={styles.streetNoteToggle}>
        <Text style={[styles.streetNoteToggleText, sNoteOpen && styles.pencilIconActive]}>
          ✎ {cap} thoughts
        </Text>
      </Pressable>

      {sNoteOpen && (
        <NoteEditor
          note={streetNote?.note ?? ''}
          flags={streetNote?.flags ?? []}
          placeholder={`${cap} thoughts…`}
          onNoteChange={t => onNoteChange(streetNoteKey, t)}
          onAddFlag={f => onAddFlag(streetNoteKey, f)}
          onRemoveFlag={i => onRemoveFlag(streetNoteKey, i)}
        />
      )}
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  visible:       boolean;
  record:        HandRecord | null;
  allRecords:    HandRecord[];
  onClose:       () => void;
  onUpdate:      (id: string, review: HandReview, status: ReviewStatus) => void;
  onOpenRecord:  (record: HandRecord) => void;
}

export function HandReviewModal({ visible, record, allRecords, onClose, onUpdate, onOpenRecord }: Props) {
  const { groups, shareHandToGroup, toggleHandFlag } = useAppData();
  const [review, setReview]             = useState<HandReview>(INITIAL_REVIEW);
  const [expandedKey, setExpanded]      = useState<string | null>(null);
  const [customTagInput, setCustomTag]  = useState('');
  const [sharingImage, setSharingImage] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  // Most people sharing a hand don't want to spoil what villain held.
  const [hideVillainCards, setHideVillainCards] = useState(true);
  // Tapping Share opens this small confirm sheet (toggle + Share/Cancel)
  // instead of showing the full card inline — the review screen stays
  // clean, and the card itself is only ever generated off-screen for the
  // actual capture.
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // Local mirror of record.flagged — toggleHandFlag mutates global state,
  // which this modal's `record` prop (a snapshot held by the parent) won't
  // pick up until it's closed and reopened, so the button needs its own
  // copy for instant feedback.
  const [flagged, setFlagged] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  useEffect(() => {
    if (record) {
      setReview(record.review);
      setExpanded(null);
      setFlagged(record.flagged);
    }
  }, [record?.id]);

  if (!record) return null;

  const draft = record.draft;

  // ── Derived display helpers ───────────────────────────────────────────────

  const labels   = draft ? (POSITION_LABELS[draft.playerCount] ?? []) : [];
  const heroPos  = (draft && draft.heroSeat !== null) ? (labels[draft.heroSeat ?? 0] ?? 'Hero') : 'Hero';
  const namedSet = new Set<string>(
    draft ? ['hero', ...draft.villainSeats.map((_, i) => `villain${i + 1}`)] : ['hero']
  );

  const HERO_COLOR     = '#1B4332';
  const VILLAIN_COLORS = ['#C04040', '#D4683A', '#C8942A'];

  const actorLabel = (actor: string): string => {
    if (!draft) return actor;
    if (actor === 'hero') return `${heroLabel(draft.heroName)} (${heroPos})`;
    if (actor.startsWith('villain')) {
      const vi   = parseInt(actor.replace('villain', ''), 10) - 1;
      const seat = draft.villainSeats[vi];
      const name = villainLabel(actor, draft.villainNames);
      return seat !== undefined ? `${name} (${labels[seat] ?? '?'})` : name;
    }
    return actor;
  };

  const actorDot = (actor: string): string => {
    if (actor === 'hero') return HERO_COLOR;
    if (actor.startsWith('villain')) return VILLAIN_COLORS[parseInt(actor.replace('villain', ''), 10) - 1] ?? VILLAIN_COLORS[0];
    return '#9A9080';
  };

  const bigBlind  = draft?.bigBlind ?? 2;
  const amountOpts: AmountOpts = { stackUnit: draft?.stackUnit ?? 'BB', bigBlind, gameType: draft?.gameType ?? null };
  const handTitle = draft ? (draft.handName.trim() || autoHandName(draft)) : record.displayPositions;

  const fmtChipAmt = (bb: number) => fmtDualAmount(bb, amountOpts);

  // ── Result — always recalculated straight from the logged hand action
  // data on every render, never a separately stored field or something the
  // user has to fill in. This runs the same way for a hand logged five
  // minutes ago and one logged before this logic existed — there's no
  // "already computed" result sitting in storage to go stale. ─────────────
  const handOutcome = draft ? computeHandOutcome(draft) : null;
  const handMath    = draft ? computeHandMath(draft) : null;
  const finalPotBB  = handMath ? handMath.finalPotBB : record.displayPotSize;
  const heroInvested = handMath
    ? (handMath.pf.investedBB['hero'] ?? 0) + (handMath.flop.investedBB['hero'] ?? 0)
      + (handMath.turn.investedBB['hero'] ?? 0) + (handMath.river.investedBB['hero'] ?? 0)
    : 0;

  // A real showdown's winner is determined by comparing actual hand
  // strength — the one outcome that can be computed purely from the logged
  // cards without any manual "who won" input. Needs a complete board and
  // every live player's hole cards on record; if any of that is missing (a
  // villain's cards were never entered), there's honestly no winner that
  // can be reported — but the result never falls back to the bare word
  // "Showdown" either, it says plainly why no winner is shown.
  const showdownWinners: string[] | null = (() => {
    if (!draft || handOutcome?.situation !== 'showdown') return null;
    const board = [...draft.flopCards, draft.turnCard, draft.riverCard].filter(Boolean) as CardType[];
    if (board.length !== 5 || !draft.card1 || !draft.card2) return null;
    const entrants: { key: string; cards: CardType[] }[] = [{ key: 'hero', cards: [draft.card1, draft.card2, ...board] }];
    for (const vKey of handOutcome.liveVillains) {
      const [c1, c2] = draft.villainHoleCards[vKey] ?? [null, null];
      if (!c1 || !c2) return null;
      entrants.push({ key: vKey, cards: [c1, c2, ...board] });
    }
    return rankShowdown(entrants);
  })();

  type ResultKind = 'hero_folded' | 'villain_folded' | 'hero_won_showdown' | 'villain_won_showdown' | 'split_pot_showdown' | 'pending_showdown' | 'unknown';

  const resultKind: ResultKind = !draft || !handOutcome ? 'unknown'
    : handOutcome.situation === 'hero_folded'    ? 'hero_folded'
    : handOutcome.situation === 'villain_folded' ? 'villain_folded'
    : !showdownWinners ? 'pending_showdown'
    : showdownWinners.length > 1 ? 'split_pot_showdown'
    : showdownWinners[0] === 'hero' ? 'hero_won_showdown'
    : 'villain_won_showdown';

  // "+$1.5K (7.5BB)" / "+1.5K (7.5BB)" / "+7.5BB" — always the WINNER's own
  // net gain (never negative, so always a "+"), a $ sign only for a cash
  // hand, K/M-compact for a tournament, never the word "chips". Kept to
  // just this — no extra clauses — so it can never overflow its banner.
  const fmtNetGain = (bb: number) => `+${fmtDualAmount(Math.abs(bb), amountOpts)}`;

  const result = (() => {
    switch (resultKind) {
      case 'hero_folded':
        return { text: `Villain ${fmtNetGain(heroInvested)}`, icon: '✗', color: '#B83232', bg: '#FCE8E8' };
      case 'villain_folded':
        return { text: `Hero ${fmtNetGain(draft && handMath ? computeFoldWinNet(draft, handMath) : 0)}`, icon: '✓', color: '#1B4332', bg: '#E6F4EC' };
      case 'hero_won_showdown':
        return { text: `Hero ${fmtNetGain(finalPotBB - heroInvested)}`, icon: '✓', color: '#1B4332', bg: '#E6F4EC' };
      case 'villain_won_showdown':
        return { text: `${draft ? villainLabel(showdownWinners![0], draft.villainNames) : 'Villain'} ${fmtNetGain(heroInvested)}`, icon: '✗', color: '#B83232', bg: '#FCE8E8' };
      case 'split_pot_showdown':
        return { text: `Split pot ${fmtNetGain(finalPotBB / showdownWinners!.length - heroInvested)}`, icon: '½', color: '#6B5020', bg: '#EEE8D8' };
      case 'pending_showdown':
        return { text: `Winner not recorded — villain cards weren't entered`, icon: '?', color: '#6B5020', bg: '#EEE8D8' };
      default:
        return { text: 'Result not recorded', icon: '?', color: C.textSecondary, bg: C.backgroundElement };
    }
  })();

  // ── Similar hands ─────────────────────────────────────────────────────────

  const similarHands = allRecords.filter(r => {
    if (r.id === record.id) return false;
    if (r.displayPotType === record.displayPotType) return true;
    return r.review.conceptTags.some(t => review.conceptTags.includes(t));
  }).slice(0, 5);

  const similarLabel = review.conceptTags.length > 0
    ? `Other "${review.conceptTags[0]}" hands`
    : `Other ${record.displayPotType} hands`;

  // ── State mutation ────────────────────────────────────────────────────────

  const update = (partial: Partial<HandReview>) => {
    const next = { ...review, ...partial };
    setReview(next);
    onUpdate(record.id, next, computeStatus(next));
  };

  const toggleExpanded = (key: string) =>
    setExpanded(prev => prev === key ? null : key);

  const handleNoteChange = (key: string, text: string) => {
    const isStreet = key.startsWith('street_');
    if (isStreet) {
      update({ streetNotes: { ...review.streetNotes,
        [key]: { note: text, flags: review.streetNotes[key]?.flags ?? [] } } });
    } else {
      update({ actionNotes: { ...review.actionNotes,
        [key]: { note: text, flags: review.actionNotes[key]?.flags ?? [] } } });
    }
  };

  const handleAddFlag = (key: string, flag: Flag) => {
    const isStreet = key.startsWith('street_');
    if (isStreet) {
      const prev = review.streetNotes[key]?.flags ?? [];
      update({ streetNotes: { ...review.streetNotes,
        [key]: { note: review.streetNotes[key]?.note ?? '', flags: [...prev, flag] } } });
    } else {
      const prev = review.actionNotes[key]?.flags ?? [];
      update({ actionNotes: { ...review.actionNotes,
        [key]: { note: review.actionNotes[key]?.note ?? '', flags: [...prev, flag] } } });
    }
  };

  const handleRemoveFlag = (key: string, index: number) => {
    const isStreet = key.startsWith('street_');
    if (isStreet) {
      const prev = review.streetNotes[key]?.flags ?? [];
      update({ streetNotes: { ...review.streetNotes,
        [key]: { note: review.streetNotes[key]?.note ?? '', flags: prev.filter((_, i) => i !== index) } } });
    } else {
      const prev = review.actionNotes[key]?.flags ?? [];
      update({ actionNotes: { ...review.actionNotes,
        [key]: { note: review.actionNotes[key]?.note ?? '', flags: prev.filter((_, i) => i !== index) } } });
    }
  };

  const toggleConceptTag = (tag: string) => {
    const next = review.conceptTags.includes(tag)
      ? review.conceptTags.filter(t => t !== tag)
      : [...review.conceptTags, tag];
    update({ conceptTags: next });
  };

  // Reviewed and Partially Reviewed are two faces of the same status field —
  // selecting one clears the other. Tapping an already-active one clears it
  // back to unreviewed (unless there's still enough review content for
  // computeStatus to call it in-progress on its own).
  const setReviewedStatus = (target: 'reviewed' | 'partial' | null) => {
    update({
      markedReviewed: target === 'reviewed',
      partiallyReviewed: target === 'partial',
      reviewedAt: target === 'reviewed' ? new Date().toISOString() : undefined,
    });
  };
  const toggleMarkedReviewed  = () => setReviewedStatus(review.markedReviewed ? null : 'reviewed');
  const togglePartiallyReviewed = () => setReviewedStatus(review.partiallyReviewed ? null : 'partial');

  // Flag is independent of review status — a hand can be flagged whether
  // it's unreviewed, partially reviewed, or fully reviewed.
  const toggleFlagged = () => {
    setFlagged(f => !f);
    toggleHandFlag(record.id);
  };

  // ── Share ─────────────────────────────────────────────────────────────────

  const buildShareText = (): string => {
    const lines: string[] = [];
    lines.push(`HAND: ${handTitle}`);
    lines.push(`Date: ${shortDate(record.createdAt)}`);
    if (draft) {
      lines.push(`Positions: ${record.displayPositions} | Stack: ${fmtChipAmt(draft.effectiveStackBB)} | Pot type: ${draft.potType}`);
    }
    lines.push('');

    const addStreet = (street: 'preflop' | 'flop' | 'turn' | 'river', acts: ActionEntry[]) => {
      const named = acts.map((e, i) => ({ e, i })).filter(({ e }) => namedSet.has(e.actor));
      if (named.length === 0 && street !== 'preflop') return;
      lines.push(`${street.toUpperCase()}:`);
      named.forEach(({ e, i }) => {
        const key = `${street}_${i}`;
        const an  = review.actionNotes[key];
        lines.push(`  ${actorLabel(e.actor)}: ${actionLabel(e.action, e.sizingBB, amountOpts)}`);
        if (an?.note.trim()) lines.push(`    Note: ${an.note.trim()}`);
        if (an?.flags.length) lines.push(`    Flags: ${an.flags.map(f => f.label).join(', ')}`);
      });
      const sn = review.streetNotes[`street_${street}`];
      if (sn?.note.trim()) lines.push(`  Thoughts: ${sn.note.trim()}`);
      if (sn?.flags.length) lines.push(`  Street flags: ${sn.flags.map(f => f.label).join(', ')}`);
      lines.push('');
    };

    if (draft) {
      addStreet('preflop', draft.preflopActions);
      if (draft.flopActions.length > 0)  addStreet('flop',  draft.flopActions);
      if (draft.turnActions.length > 0)  addStreet('turn',  draft.turnActions);
      if (draft.riverActions.length > 0) addStreet('river', draft.riverActions);
    }

    if (resultKind !== 'unknown') lines.push(`Result: ${result.text}`);
    if (review.conceptTags.length) lines.push(`Tags: ${review.conceptTags.join(', ')}`);
    if (review.overallNotes.trim()) { lines.push(''); lines.push(`Notes: ${review.overallNotes.trim()}`); }

    return lines.join('\n');
  };

  // Same visual card as the Tag & Save screen's "Share Hand" — captured
  // off-screen from the hidden ViewShot host near the bottom of this modal
  // (never shown inline here). Falls back to the old text share only if
  // this record somehow has no draft to render a card from (pre-draft
  // legacy data).
  const handleShareImage = async () => {
    if (!draft) { try { await Share.share({ message: buildShareText() }); } catch {} return; }
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
      console.error('[ShareHand:Review] failed:', err);
      setSharingImage(false);
      Alert.alert('Could not share hand', err instanceof Error ? err.message : 'Something went wrong generating the image.');
    }
  };

  // Tapping "Share hand" opens the small confirm sheet (toggle + Share)
  // rather than sharing immediately — but only when there's actually a card
  // to toggle; legacy drafts with no card fall straight to the text share.
  const openShareSheet = () => { if (draft) setShareSheetOpen(true); else handleShareImage(); };
  const confirmShareImage = () => { setShareSheetOpen(false); handleShareImage(); };

  const handleCopy = () => {
    Clipboard.setString(buildShareText());
    Alert.alert('Copied', 'Hand summary copied to clipboard.');
  };

  const handleAddToGroup = (group: Group) => {
    shareHandToGroup(group.id, record.id, '');
    setGroupPickerOpen(false);
    Alert.alert('Added', `Hand added to ${group.name}.`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>‹ Hands</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.handTitle} numberOfLines={2}>{handTitle}</Text>
          </View>
          {draft?.card1 && draft?.card2
            ? <View style={styles.holeCards}>
                <CardFace card={draft.card1} size="sm" />
                <CardFace card={draft.card2} size="sm" />
              </View>
            : <Text style={styles.holeCardsText}>{record.displayHoleCards}</Text>}
        </View>

        {/* ── Meta row ── */}
        <View style={styles.metaRow}>
          <MetaChip label={record.displayPositions} />
          {draft && <MetaChip label={`${fmtChipAmt(draft.effectiveStackBB)} eff.`} />}
          {draft?.stakes ? <MetaChip label={draft.stakes} /> : null}
          <MetaChip label={record.displayPotType} />
          <MetaChip label={shortDate(record.createdAt)} />
        </View>

        {/* ── Scrollable body ── */}
        <KeyboardAvoidingView style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={120}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}>

            {/* HAND REPLAY */}
            <View style={styles.card}>
              <SectionHeader title="Hand Replay" />
              {draft ? (
                <>
                  <StreetSection street="preflop" actions={draft.preflopActions}
                    review={review} expandedKey={expandedKey} amountOpts={amountOpts}
                    actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                    onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                    onAddFlag={handleAddFlag} onRemoveFlag={handleRemoveFlag} />

                  {(draft.flopCards.some(Boolean) || draft.flopActions.length > 0) && (
                    <StreetSection street="flop" actions={draft.flopActions} boardCards={draft.flopCards}
                      review={review} expandedKey={expandedKey} amountOpts={amountOpts}
                      actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                      onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                      onAddFlag={handleAddFlag} onRemoveFlag={handleRemoveFlag} />
                  )}

                  {(draft.turnCard || draft.turnActions.length > 0) && (
                    <StreetSection street="turn" actions={draft.turnActions} boardCards={[draft.turnCard]}
                      review={review} expandedKey={expandedKey} amountOpts={amountOpts}
                      actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                      onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                      onAddFlag={handleAddFlag} onRemoveFlag={handleRemoveFlag} />
                  )}

                  {(draft.riverCard || draft.riverActions.length > 0) && (
                    <StreetSection street="river" actions={draft.riverActions} boardCards={[draft.riverCard]}
                      review={review} expandedKey={expandedKey} amountOpts={amountOpts}
                      actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                      onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                      onAddFlag={handleAddFlag} onRemoveFlag={handleRemoveFlag} />
                  )}
                </>
              ) : (
                <Text style={styles.noReplayText}>Full hand log not available.</Text>
              )}
            </View>

            {/* RESULT — read-only, always recalculated from the hand's own
                logged data (actions + whatever cards were recorded at the
                time), never typed in. To change it, edit the hand itself via
                swipe-to-edit on the Hands tab — not from here. */}
            <View style={styles.card}>
              <SectionHeader title="Result" />
              <View style={[styles.resultBanner, { backgroundColor: result.bg }]}>
                <Text style={[styles.resultIcon, { color: result.color }]}>{result.icon}</Text>
                {/* flexShrink: RN Views don't shrink by default (unlike web),
                    so without this a long result line pushes past the
                    banner's edge instead of wrapping onto a second line. */}
                <View style={{ flex: 1, flexShrink: 1 }}>
                  <Text style={[styles.resultText, { color: result.color }]}>{result.text}</Text>
                </View>
              </View>
            </View>

            {/* REVIEW */}
            <View style={styles.card}>
              <SectionHeader title="Review" />

              {/* Concept tags */}
              <SubLabel text="Concept tags" />
              {review.conceptTags.length > 0 && (
                <View style={styles.tagGrid}>
                  {review.conceptTags.map(tag => (
                    <Pressable key={tag} onPress={() => toggleConceptTag(tag)}
                      style={[styles.conceptTag, { backgroundColor: C.tint + '22', borderColor: C.tint }]}>
                      <Text style={[styles.conceptTagText, styles.conceptTagActive]}>{tag} ×</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.customTagRow}>
                <TextInput
                  style={styles.customTagInput}
                  value={customTagInput}
                  onChangeText={setCustomTag}
                  placeholder="+ Add custom tag"
                  placeholderTextColor={C.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    const t = customTagInput.trim();
                    if (t && !review.conceptTags.includes(t)) update({ conceptTags: [...review.conceptTags, t] });
                    setCustomTag('');
                  }}
                />
              </View>

              {/* Overall notes */}
              <SubLabel text="Overall notes" mt={16} />
              <TextInput
                style={[styles.noteInput, { minHeight: 100 }]}
                multiline
                value={review.overallNotes}
                onChangeText={v => update({ overallNotes: v })}
                placeholder="What did you learn? Key takeaways…"
                placeholderTextColor={NOTE_PLACEHOLDER_COLOR}
                textAlignVertical="top"
              />
              <DoneLink />
            </View>

            {/* SIMILAR HANDS */}
            {similarHands.length > 0 && (
              <View style={styles.card}>
                <SectionHeader title="Similar Hands" />
                <Text style={styles.similarLabel}>{similarLabel}</Text>
                {similarHands.map(r => (
                  <Pressable key={r.id} onPress={() => onOpenRecord(r)}
                    style={({ pressed }) => [styles.similarRow, pressed && { opacity: 0.7 }]}>
                    <View style={[styles.similarDot, { backgroundColor: r.status === 'reviewed' ? '#2E7D52' : r.status === 'in_progress' ? '#D9874A' : '#E05252' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.similarTitle}>{r.displayPositions} — {r.displayHoleCards}</Text>
                      <Text style={styles.similarMeta}>{r.displayPotType} · {r.displayStreet}</Text>
                    </View>
                    <Text style={styles.similarArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* SHARE */}
            <View style={styles.card}>
              <SectionHeader title="Share" />

              <View style={styles.sharingRow}>
                <Pressable style={styles.sharingBtn} onPress={() => setGroupPickerOpen(v => !v)}>
                  <Text style={styles.sharingBtnText}>Add to Group</Text>
                </Pressable>
              </View>

              {groupPickerOpen && (
                <View style={styles.groupPicker}>
                  {groups.length === 0 ? (
                    <Text style={styles.groupPickerEmpty}>No groups yet — create one from the Groups tab.</Text>
                  ) : (
                    groups.map(g => (
                      <Pressable key={g.id} onPress={() => handleAddToGroup(g)}
                        style={({ pressed }) => [styles.groupPickerRow, pressed && { opacity: 0.7 }]}>
                        <Text style={styles.groupPickerRowText}>{g.name}</Text>
                        <Text style={styles.similarArrow}>›</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              )}

              <View style={[styles.sharingRow, { marginTop: 8 }]}>
                <Pressable style={styles.sharingBtn} onPress={openShareSheet} disabled={sharingImage}>
                  <Text style={styles.sharingBtnText}>{sharingImage ? 'Preparing image…' : '↗ Share hand'}</Text>
                </Pressable>
                <Pressable style={styles.sharingBtn} onPress={handleCopy}>
                  <Text style={styles.sharingBtnText}>⎘ Copy to clipboard</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Sticky footer ── */}
        <View style={styles.footer}>
          <View style={styles.statusRow}>
            <Pressable
              onPress={toggleMarkedReviewed}
              style={[styles.statusBtn, review.markedReviewed && styles.statusBtnReviewed]}>
              <Text style={[styles.statusBtnText, review.markedReviewed && styles.statusBtnTextActive]}>
                Mark as Reviewed
              </Text>
            </Pressable>
            <Pressable
              onPress={toggleFlagged}
              style={[styles.statusBtn, flagged && styles.statusBtnFlagged]}>
              <Text style={[styles.statusBtnText, flagged && styles.statusBtnTextActive]}>Flag</Text>
            </Pressable>
            <Pressable
              onPress={togglePartiallyReviewed}
              style={[styles.statusBtn, review.partiallyReviewed && styles.statusBtnPartial]}>
              <Text style={[styles.statusBtnText, review.partiallyReviewed && styles.statusBtnTextActive]}>
                Partially Reviewed
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.reviewBtn}>
            <Text style={styles.reviewBtnText}>Save</Text>
          </Pressable>
        </View>

        {/* Off-screen — outside the ScrollView so it's never clipped —
            captured for the share image, never shown to the user. The
            review screen stays clean; only the small sheet below is ever
            visible before a share. */}
        {draft && (
          <View pointerEvents="none" style={styles.hiddenCardHost}>
            {/* No width/height override — see the matching ViewShot in
                log-hand-modal.tsx for why: default capture is already at
                real device pixel resolution, which is the sharpest this
                library can produce (there's no separate pixelRatio option). */}
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
              <HandHistoryCard draft={draft} now={new Date(record.createdAt)} hideVillainCards={hideVillainCards} />
            </ViewShot>
          </View>
        )}

        {/* Share confirm sheet — the only place the villain-cards toggle is
            ever shown on this screen, and only right before actually
            sharing, not as a standing preview. */}
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
    </Modal>
  );
}

// ─── MetaChip ─────────────────────────────────────────────────────────────────

function MetaChip({ label, accent }: { label: string; accent?: boolean }) {
  if (!label) return null;
  return (
    <View style={[styles.metaChip, accent && styles.metaChipAccent]}>
      <Text style={[styles.metaChipText, accent && styles.metaChipTextAccent]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.background },

  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.backgroundElement, gap: 8 },
  backBtn:        { paddingRight: 6 },
  backBtnText:    { fontSize: 16, fontWeight: '600', color: C.tint },
  headerCenter:   { flex: 1 },
  handTitle:      { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 20 },
  holeCards:      { flexDirection: 'row', gap: 3 },
  holeCardsText:  { fontSize: 16, fontWeight: '700', color: C.text },

  metaRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.three, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.backgroundElement },
  metaChip:       { backgroundColor: C.backgroundElement, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  metaChipAccent: { backgroundColor: '#FFF0E0', borderWidth: 1, borderColor: '#D4683A88' },
  metaChipText:   { fontSize: 11, fontWeight: '600', color: C.textSecondary },
  metaChipTextAccent: { color: '#D4683A' },

  scroll:         { flex: 1 },
  scrollContent:  { padding: Spacing.three, gap: Spacing.three },

  card:           { backgroundColor: '#fff', borderRadius: 16, padding: Spacing.three, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },

  sectionHeader:  { fontSize: 12, fontWeight: '800', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  subLabel:       { fontSize: 11, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  noReplayText:   { fontSize: 14, color: C.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },

  // Street section
  streetSection:  { gap: 4 },
  streetHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.backgroundElement },
  streetLabel:    { fontSize: 13, fontWeight: '800', color: C.text, minWidth: 55 },
  boardCards:     { flexDirection: 'row', gap: 4 },

  // Action row
  actionRowWrap:  { gap: 0 },
  actionRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: C.backgroundElement + 'aa' },
  actionRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  actorDot:       { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  actorName:      { fontSize: 13, fontWeight: '600', color: C.text },
  flagBadge:      { backgroundColor: C.tint, borderRadius: 9, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  flagBadgeText:  { fontSize: 9, fontWeight: '800', color: '#fff' },
  actionRowRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText:     { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  pencilIcon:       { fontSize: 12, color: C.textSecondary },
  pencilIconActive: { color: C.tint },

  // Pill
  pill:       { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pillText:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  // Street note toggle
  streetNoteToggle:     { paddingVertical: 8 },
  streetNoteToggleText: { fontSize: 12, fontWeight: '600', color: C.textSecondary },

  // Note editor — dashed border on the input itself so the writable area
  // reads as tappable even before the pencil icon registers.
  // Plain wrapper, no background/padding of its own — the dashed-bordered
  // TextInput below is the only "box" here. A second nested panel behind it
  // is what made this look like a floating card stuck above the keyboard
  // once everything else scrolled out of view to bring it into focus.
  noteEditor: { gap: 8, marginVertical: 2 },
  // Same cream as the noteEditor wrapper it sits in — the dashed border does
  // the work of marking it tappable. Typed text is a soft muted grey rather
  // than the app's near-black default so it feels lighter to read back.
  noteInput:  { backgroundColor: NOTE_INPUT_BG, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.backgroundSelected, padding: 10, fontSize: 14, color: NOTE_TEXT_COLOR, minHeight: 80 },
  doneLinkWrap: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 2 },
  doneLinkText: { fontSize: 13, fontWeight: '600', color: C.tint },

  // Flag row (active)
  flagRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },

  // Flag tag
  flagTag:       { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  flagTagText:   { fontSize: 10, fontWeight: '700' },
  flagTagRemove: { fontSize: 14, fontWeight: '700', lineHeight: 16 },

  // "+ Add Flag" button + inline form
  addFlagBtn:     { alignSelf: 'flex-start' },
  addFlagBtnText: { fontSize: 12, fontWeight: '700', color: C.tint },
  addFlagForm:        { gap: 8 },
  addFlagFormActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  colorSwatchRow:   { flexDirection: 'row', gap: 8 },
  colorSwatch:      { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive:{ borderColor: C.text },
  flagCancelBtn:      { paddingHorizontal: 12, paddingVertical: 6 },
  flagCancelBtnText:  { fontSize: 12, fontWeight: '600', color: C.textSecondary },

  // Custom flag / custom tag input
  customFlagInput:  { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: C.backgroundSelected, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: C.text },
  customFlagAdd:    { backgroundColor: C.tint, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  customFlagAddText:{ fontSize: 12, fontWeight: '700', color: '#fff' },

  // Result
  resultBanner:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14 },
  resultIcon:    { fontSize: 22, fontWeight: '800' },
  resultText:    { fontSize: 15, fontWeight: '700' },

  // Concept tags
  tagGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  conceptTag:      { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  conceptTagText:  { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  conceptTagActive:{ color: C.tint, fontWeight: '700' },
  customTagRow:    { flexDirection: 'row' },
  customTagInput:  { flex: 1, backgroundColor: C.backgroundElement, borderRadius: 8, borderWidth: 1, borderColor: C.backgroundSelected, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: C.text },

  // Group picker
  groupPicker:       { backgroundColor: C.backgroundElement, borderRadius: 10, padding: 4, marginTop: 8 },
  groupPickerEmpty:  { fontSize: 12, color: C.textSecondary, padding: 10, textAlign: 'center' },
  groupPickerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 10 },
  groupPickerRowText:{ fontSize: 13, fontWeight: '600', color: C.text },

  // Similar hands
  similarLabel: { fontSize: 12, color: C.textSecondary, fontWeight: '600', marginBottom: 4 },
  similarRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.backgroundElement },
  similarDot:   { width: 8, height: 8, borderRadius: 4 },
  similarTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  similarMeta:  { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  similarArrow: { fontSize: 18, color: C.textSecondary, marginLeft: 4 },

  // Sharing
  sharingRow:    { flexDirection: 'row', gap: 8 },
  sharingBtn:    { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, backgroundColor: C.backgroundElement, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6 },
  sharingBtnText:{ fontSize: 12, fontWeight: '600', color: C.tint },

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

  // Footer
  footer:             { paddingHorizontal: Spacing.three, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.backgroundElement, gap: 10 },
  reviewBtn:          { backgroundColor: C.tint, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  reviewBtnText:      { fontSize: 16, fontWeight: '800', color: '#D4EDDA' },

  // Status row — Reviewed/Partially Reviewed are mutually exclusive (both
  // drive the same underlying status); Flag is independent of either.
  statusRow:          { flexDirection: 'row', gap: 8 },
  statusBtn:          { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: C.backgroundElement },
  statusBtnReviewed:  { backgroundColor: C.tint },
  statusBtnFlagged:   { backgroundColor: C.negative },
  statusBtnPartial:   { backgroundColor: C.gold },
  statusBtnText:      { fontSize: 11, fontWeight: '700', color: C.textSecondary, textAlign: 'center' },
  statusBtnTextActive:{ color: '#fff' },
});
