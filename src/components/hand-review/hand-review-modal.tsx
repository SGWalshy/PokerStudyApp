import { useEffect, useState } from 'react';
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

import { Colors, Spacing } from '@/constants/theme';
import { CardFace } from '../log-hand/card-picker';
import {
  ActionEntry,
  AnyAction,
  CardType,
  HandDraft,
  POSITION_LABELS,
  autoHandName,
  holeCardsLabel,
} from '../log-hand/types';
import {
  ACTION_PROMPTS,
  ActionNote,
  CONCEPT_TAG_PRESETS,
  INITIAL_REVIEW,
  MISTAKE_CATEGORIES,
  STREET_PROMPTS,
  STUDY_FLAGS,
  DecisionRating,
  HandRecord,
  HandReview,
  MistakeCategory,
  ReviewStatus,
  computeStatus,
} from './types';

const C = Colors.light;

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

function fmtBB(bb: number): string {
  return bb % 1 === 0 ? `${bb}BB` : `${bb.toFixed(1)}BB`;
}

function actionLabel(action: AnyAction, sizingBB: number, showChips: boolean, bigBlind: number): string {
  const fmt = (bb: number) =>
    showChips && bigBlind > 0 ? `$${(bb * bigBlind).toFixed(0)}` : fmtBB(bb);
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

function PromptRow({ prompts, onSelect }: { prompts: string[]; onSelect: (p: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={styles.promptScroll} contentContainerStyle={styles.promptRow}>
      {prompts.map(p => (
        <Pressable key={p} onPress={() => onSelect(p)} style={styles.promptChip}>
          <Text style={styles.promptChipText}>{p}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── NoteEditor ───────────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: string;
  flags: string[];
  prompts: string[];
  placeholder: string;
  onNoteChange: (text: string) => void;
  onFlagToggle: (flag: string) => void;
  onCustomFlag: (label: string) => void;
}

function NoteEditor({ note, flags, prompts, placeholder, onNoteChange, onFlagToggle, onCustomFlag }: NoteEditorProps) {
  const [showFlags, setShowFlags]       = useState(false);
  const [customFlagText, setCustomFlag] = useState('');

  const submitCustomFlag = () => {
    const t = customFlagText.trim();
    if (t) { onCustomFlag(t); setCustomFlag(''); }
  };

  return (
    <View style={styles.noteEditor}>
      <PromptRow prompts={prompts} onSelect={p => onNoteChange(note ? `${note}\n\n${p}\n` : `${p}\n`)} />

      <TextInput
        style={styles.noteInput}
        multiline
        value={note}
        onChangeText={onNoteChange}
        placeholder={placeholder}
        placeholderTextColor={C.textSecondary}
        textAlignVertical="top"
      />
      <DoneLink />

      {/* Active flags */}
      {flags.length > 0 && (
        <View style={styles.flagRow}>
          {flags.map(f => {
            const def = STUDY_FLAGS.find(d => d.key === f) ?? { label: f, color: '#666' };
            return <FlagTag key={f} label={def.label} color={def.color} onRemove={() => onFlagToggle(f)} />;
          })}
        </View>
      )}

      <Pressable onPress={() => setShowFlags(v => !v)} style={styles.flagToggleBtn}>
        <Text style={styles.flagToggleBtnText}>
          {showFlags ? '▲ Hide flags' : '▼ Study flags'}{flags.length > 0 ? ` · ${flags.length} active` : ''}
        </Text>
      </Pressable>

      {showFlags && (
        <View style={styles.flagGrid}>
          {STUDY_FLAGS.map(def => {
            const active = flags.includes(def.key);
            return (
              <Pressable key={def.key} onPress={() => onFlagToggle(def.key)}
                style={[styles.flagGridItem,
                  { borderColor: def.color + (active ? 'cc' : '44'),
                    backgroundColor: active ? def.color + '22' : 'transparent' }]}>
                <Text style={[styles.flagGridText, { color: active ? def.color : C.textSecondary }]}>
                  {def.label}
                </Text>
              </Pressable>
            );
          })}
          <View style={styles.customFlagRow}>
            <TextInput
              style={styles.customFlagInput}
              value={customFlagText}
              onChangeText={setCustomFlag}
              placeholder="Custom flag…"
              placeholderTextColor={C.textSecondary}
              returnKeyType="done"
              onSubmitEditing={submitCustomFlag}
            />
            <Pressable onPress={submitCustomFlag} style={styles.customFlagAdd}>
              <Text style={styles.customFlagAddText}>Add</Text>
            </Pressable>
          </View>
        </View>
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
  showChips:  boolean;
  bigBlind:   number;
  onToggle:   () => void;
  onNoteChange:  (text: string) => void;
  onFlagToggle:  (flag: string) => void;
  onCustomFlag:  (label: string) => void;
}

function ReviewActionRow({
  actorLabel, dotColor, entry, note, isExpanded,
  showChips, bigBlind, onToggle, onNoteChange, onFlagToggle, onCustomFlag,
}: ActionRowProps) {
  const hasNote = !!(note?.note.trim()) || (note?.flags.length ?? 0) > 0;
  const prompts = ACTION_PROMPTS[entry.action] ?? ACTION_PROMPTS['check'];

  return (
    <View style={styles.actionRowWrap}>
      <Pressable onPress={onToggle} style={styles.actionRow}>
        <View style={styles.actionRowLeft}>
          <View style={[styles.actorDot, { backgroundColor: dotColor }]} />
          <Text style={styles.actorName}>{actorLabel}</Text>
          {hasNote && <Text style={styles.noteIcon}>✎</Text>}
          {(note?.flags.length ?? 0) > 0 && (
            <View style={styles.flagBadge}>
              <Text style={styles.flagBadgeText}>{note!.flags.length}</Text>
            </View>
          )}
        </View>
        <View style={styles.actionRowRight}>
          <Text style={styles.actionText}>{actionLabel(entry.action, entry.sizingBB, showChips, bigBlind)}</Text>
          <ActionPill action={entry.action} />
          <Text style={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</Text>
        </View>
      </Pressable>

      {isExpanded && (
        <NoteEditor
          note={note?.note ?? ''}
          flags={note?.flags ?? []}
          prompts={prompts}
          placeholder="Add your thoughts on this action…"
          onNoteChange={onNoteChange}
          onFlagToggle={onFlagToggle}
          onCustomFlag={onCustomFlag}
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
  showChips:   boolean;
  bigBlind:    number;
  actorLabel:  (actor: string) => string;
  actorDot:    (actor: string) => string;
  isNamed:     (actor: string) => boolean;
  onToggle:    (key: string) => void;
  onNoteChange:(key: string, text: string) => void;
  onFlagToggle:(key: string, flag: string) => void;
  onCustomFlag:(key: string, label: string) => void;
}

function StreetSection({
  street, actions, boardCards, review, expandedKey,
  showChips, bigBlind, actorLabel, actorDot, isNamed,
  onToggle, onNoteChange, onFlagToggle, onCustomFlag,
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
            showChips={showChips}
            bigBlind={bigBlind}
            onToggle={() => onToggle(noteKey)}
            onNoteChange={t => onNoteChange(noteKey, t)}
            onFlagToggle={f => onFlagToggle(noteKey, f)}
            onCustomFlag={l => onCustomFlag(noteKey, l)}
          />
        );
      })}

      <Pressable onPress={() => onToggle(streetNoteKey)} style={styles.streetNoteToggle}>
        <Text style={styles.streetNoteToggleText}>
          {sNoteOpen ? '▲' : '▼'} {cap} thoughts{streetNote?.note.trim() ? ' ✎' : ''}
        </Text>
      </Pressable>

      {sNoteOpen && (
        <NoteEditor
          note={streetNote?.note ?? ''}
          flags={streetNote?.flags ?? []}
          prompts={STREET_PROMPTS}
          placeholder={`${cap} thoughts…`}
          onNoteChange={t => onNoteChange(streetNoteKey, t)}
          onFlagToggle={f => onFlagToggle(streetNoteKey, f)}
          onCustomFlag={l => onCustomFlag(streetNoteKey, l)}
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
  const [review, setReview]             = useState<HandReview>(INITIAL_REVIEW);
  const [expandedKey, setExpanded]      = useState<string | null>(null);
  const [customTagInput, setCustomTag]  = useState('');
  const [showReviewedMsg, setRevMsg]    = useState(false);

  useEffect(() => {
    if (record) {
      setReview(record.review);
      setExpanded(null);
      setRevMsg(record.review.markedReviewed);
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
    if (actor === 'hero') return `Hero (${heroPos})`;
    if (actor.startsWith('villain')) {
      const vi   = parseInt(actor.replace('villain', ''), 10) - 1;
      const seat = draft.villainSeats[vi];
      return seat !== undefined ? `V${vi + 1} (${labels[seat] ?? '?'})` : `V${vi + 1}`;
    }
    return actor;
  };

  const actorDot = (actor: string): string => {
    if (actor === 'hero') return HERO_COLOR;
    if (actor.startsWith('villain')) return VILLAIN_COLORS[parseInt(actor.replace('villain', ''), 10) - 1] ?? VILLAIN_COLORS[0];
    return '#9A9080';
  };

  const showChips = draft?.stackUnit === 'Chips' && (draft?.bigBlind ?? 0) > 0;
  const bigBlind  = draft?.bigBlind ?? 2;
  const handTitle = draft ? (draft.handName.trim() || autoHandName(draft)) : record.displayPositions;

  const heroWon  = draft ? (!draft.heroFolded && (draft.result === 'won' || draft.villainMucked)) : null;
  const heroLost = draft ? (draft.heroFolded || draft.result === 'lost') : null;

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

  const handleFlagToggle = (key: string, flag: string) => {
    const isStreet = key.startsWith('street_');
    if (isStreet) {
      const prev = review.streetNotes[key]?.flags ?? [];
      const next = prev.includes(flag) ? prev.filter(f => f !== flag) : [...prev, flag];
      update({ streetNotes: { ...review.streetNotes,
        [key]: { note: review.streetNotes[key]?.note ?? '', flags: next } } });
    } else {
      const prev = review.actionNotes[key]?.flags ?? [];
      const next = prev.includes(flag) ? prev.filter(f => f !== flag) : [...prev, flag];
      update({ actionNotes: { ...review.actionNotes,
        [key]: { note: review.actionNotes[key]?.note ?? '', flags: next } } });
    }
  };

  const handleCustomFlag = (key: string, label: string) => handleFlagToggle(key, label);

  const toggleMistakeCategory = (cat: MistakeCategory) => {
    const prev = review.mistakeCategories;
    const next = prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat];
    update({ mistakeCategories: next });
  };

  const toggleConceptTag = (tag: string) => {
    const next = review.conceptTags.includes(tag)
      ? review.conceptTags.filter(t => t !== tag)
      : [...review.conceptTags, tag];
    update({ conceptTags: next });
  };

  const handleMarkReviewed = () => {
    const reviewedAt = new Date().toISOString();
    update({ markedReviewed: true, reviewedAt });
    setRevMsg(true);
  };

  // ── Share ─────────────────────────────────────────────────────────────────

  const buildShareText = (): string => {
    const lines: string[] = [];
    lines.push(`HAND: ${handTitle}`);
    lines.push(`Date: ${shortDate(record.createdAt)}`);
    if (draft) {
      lines.push(`Positions: ${record.displayPositions} | Stack: ${draft.effectiveStackBB}BB | Pot type: ${draft.potType}`);
    }
    lines.push('');

    const addStreet = (street: 'preflop' | 'flop' | 'turn' | 'river', acts: ActionEntry[]) => {
      const named = acts.map((e, i) => ({ e, i })).filter(({ e }) => namedSet.has(e.actor));
      if (named.length === 0 && street !== 'preflop') return;
      lines.push(`${street.toUpperCase()}:`);
      named.forEach(({ e, i }) => {
        const key = `${street}_${i}`;
        const an  = review.actionNotes[key];
        lines.push(`  ${actorLabel(e.actor)}: ${actionLabel(e.action, e.sizingBB, showChips, bigBlind)}`);
        if (an?.note.trim()) lines.push(`    Note: ${an.note.trim()}`);
        if (an?.flags.length) lines.push(`    Flags: ${an.flags.join(', ')}`);
      });
      const sn = review.streetNotes[`street_${street}`];
      if (sn?.note.trim()) lines.push(`  Thoughts: ${sn.note.trim()}`);
      if (sn?.flags.length) lines.push(`  Street flags: ${sn.flags.join(', ')}`);
      lines.push('');
    };

    if (draft) {
      addStreet('preflop', draft.preflopActions);
      if (draft.flopActions.length > 0)  addStreet('flop',  draft.flopActions);
      if (draft.turnActions.length > 0)  addStreet('turn',  draft.turnActions);
      if (draft.riverActions.length > 0) addStreet('river', draft.riverActions);
    }

    if (heroWon !== null) lines.push(`Result: ${heroWon ? '✓ Won' : '✗ Lost'} (${record.displayPotSize}BB pot)`);
    if (review.decisionRating) {
      let line = `Decision: ${review.decisionRating}`;
      if (review.mistakeCategories.length) line += ` — ${review.mistakeCategories.join(', ')}`;
      lines.push(line);
    }
    if (review.conceptTags.length) lines.push(`Tags: ${review.conceptTags.join(', ')}`);

    if (review.solverOutput.trim()) {
      lines.push('');
      lines.push(`SOLVER ANALYSIS:`);
      lines.push(`  You did: ${actionLabel((draft?.preflopActions[0]?.action ?? 'check'), 0, false, 2)} (see replay)`);
      if (review.solverRecommends.trim()) lines.push(`  Solver recommends: ${review.solverRecommends.trim()}`);
      if (review.evDifference.trim())     lines.push(`  EV difference: ${review.evDifference.trim()}`);
      lines.push(`  Raw output: ${review.solverOutput.trim()}`);
    }

    if (review.overallNotes.trim()) { lines.push(''); lines.push(`Notes: ${review.overallNotes.trim()}`); }
    if (review.coachFeedback.trim()) { lines.push(''); lines.push(`Coach feedback: ${review.coachFeedback.trim()}`); }
    if (review.requestCoachReview) lines.push('⚑ Flagged for coach review');

    return lines.join('\n');
  };

  const handleShare = async () => {
    try { await Share.share({ message: buildShareText() }); } catch {}
  };

  const handleCopy = () => {
    Clipboard.setString(buildShareText());
    Alert.alert('Copied', 'Hand summary copied to clipboard.');
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
          {draft && <MetaChip label={`${draft.effectiveStackBB}BB eff.`} />}
          {draft?.stakes ? <MetaChip label={draft.stakes} /> : null}
          <MetaChip label={record.displayPotType} />
          <MetaChip label={shortDate(record.createdAt)} />
          {review.requestCoachReview && <MetaChip label="⚑ Coach review" accent />}
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
                    review={review} expandedKey={expandedKey} showChips={showChips} bigBlind={bigBlind}
                    actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                    onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                    onFlagToggle={(k, f) => handleFlagToggle(k, f)} onCustomFlag={handleCustomFlag} />

                  {(draft.flopCards.some(Boolean) || draft.flopActions.length > 0) && (
                    <StreetSection street="flop" actions={draft.flopActions} boardCards={draft.flopCards}
                      review={review} expandedKey={expandedKey} showChips={showChips} bigBlind={bigBlind}
                      actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                      onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                      onFlagToggle={(k, f) => handleFlagToggle(k, f)} onCustomFlag={handleCustomFlag} />
                  )}

                  {(draft.turnCard || draft.turnActions.length > 0) && (
                    <StreetSection street="turn" actions={draft.turnActions} boardCards={[draft.turnCard]}
                      review={review} expandedKey={expandedKey} showChips={showChips} bigBlind={bigBlind}
                      actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                      onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                      onFlagToggle={(k, f) => handleFlagToggle(k, f)} onCustomFlag={handleCustomFlag} />
                  )}

                  {(draft.riverCard || draft.riverActions.length > 0) && (
                    <StreetSection street="river" actions={draft.riverActions} boardCards={[draft.riverCard]}
                      review={review} expandedKey={expandedKey} showChips={showChips} bigBlind={bigBlind}
                      actorLabel={actorLabel} actorDot={actorDot} isNamed={a => namedSet.has(a)}
                      onToggle={toggleExpanded} onNoteChange={handleNoteChange}
                      onFlagToggle={(k, f) => handleFlagToggle(k, f)} onCustomFlag={handleCustomFlag} />
                  )}
                </>
              ) : (
                <Text style={styles.noReplayText}>Full hand log not available.</Text>
              )}
            </View>

            {/* RESULT */}
            <View style={styles.card}>
              <SectionHeader title="Result" />
              <View style={[styles.resultBanner,
                heroWon === true  ? styles.resultWon :
                heroLost === true ? styles.resultLost : styles.resultUnknown]}>
                <Text style={[styles.resultIcon,
                  heroWon === true ? { color: '#1B4332' } : heroLost === true ? { color: '#B83232' } : {}]}>
                  {heroWon === true ? '✓' : heroLost === true ? '✗' : '?'}
                </Text>
                <View>
                  <Text style={[styles.resultText,
                    heroWon === true ? { color: '#1B4332' } : heroLost === true ? { color: '#B83232' } : { color: C.textSecondary }]}>
                    {heroWon === true
                      ? `Won ${record.displayPotSize}BB pot`
                      : heroLost === true
                      ? draft?.heroFolded
                        ? `Folded${draft.foldedOn ? ` on the ${draft.foldedOn}` : ''}`
                        : `Lost — ${record.displayPotSize}BB pot`
                      : 'Result not recorded'}
                  </Text>
                </View>
              </View>
            </View>

            {/* REVIEW */}
            <View style={styles.card}>
              <SectionHeader title="Review" />

              {/* Decision quality */}
              <SubLabel text="Decision quality" />
              <View style={styles.ratingRow}>
                {(['good', 'mistake', 'unsure'] as DecisionRating[]).map(r => {
                  const active = review.decisionRating === r;
                  const col    = r === 'good' ? '#2E7D52' : r === 'mistake' ? '#C04040' : '#C8940A';
                  return (
                    <Pressable key={r}
                      onPress={() => update({
                        decisionRating:   active ? undefined : r,
                        mistakeCategories: active ? [] : review.mistakeCategories,
                      })}
                      style={[styles.ratingBtn,
                        { borderColor: active ? col : col + '44', backgroundColor: active ? col + '18' : 'transparent' }]}>
                      <Text style={[styles.ratingBtnText, { color: active ? col : C.textSecondary }]}>
                        {r === 'good' ? '✓ Good' : r === 'mistake' ? '✗ Mistake' : '~ Unsure'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Mistake categories — multi-select */}
              {review.decisionRating === 'mistake' && (
                <>
                  <SubLabel text="Mistake type (select all that apply)" mt={12} />
                  <View style={styles.mistakeGrid}>
                    {MISTAKE_CATEGORIES.map(({ key, label }) => {
                      const active = review.mistakeCategories.includes(key);
                      return (
                        <Pressable key={key} onPress={() => toggleMistakeCategory(key)}
                          style={[styles.mistakeBtn,
                            active ? { backgroundColor: '#C04040', borderColor: '#C04040' }
                                   : { borderColor: '#C0404066' }]}>
                          <Text style={[styles.mistakeBtnText, { color: active ? '#fff' : '#C04040' }]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Concept tags */}
              <SubLabel text="Concept tags" mt={16} />
              <View style={styles.tagGrid}>
                {[
                  ...CONCEPT_TAG_PRESETS,
                  ...review.conceptTags.filter(t => !CONCEPT_TAG_PRESETS.includes(t)),
                ].map(tag => {
                  const active = review.conceptTags.includes(tag);
                  return (
                    <Pressable key={tag} onPress={() => toggleConceptTag(tag)}
                      style={[styles.conceptTag,
                        active ? { backgroundColor: C.tint + '22', borderColor: C.tint }
                               : { borderColor: C.backgroundSelected }]}>
                      <Text style={[styles.conceptTagText, active && styles.conceptTagActive]}>{tag}</Text>
                    </Pressable>
                  );
                })}
              </View>
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

              {/* Solver Analysis */}
              <SubLabel text="Solver Analysis" mt={16} />
              <TextInput
                style={[styles.noteInput, { minHeight: 70 }]}
                multiline
                value={review.solverOutput}
                onChangeText={v => update({ solverOutput: v })}
                placeholder="Paste raw solver output here…"
                placeholderTextColor={C.textSecondary}
                textAlignVertical="top"
              />
              <DoneLink />
              <View style={styles.solverGrid}>
                <View style={styles.solverRow}>
                  <Text style={styles.solverRowLabel}>You did:</Text>
                  <Text style={styles.solverRowValue}>
                    {draft && draft.preflopActions.filter(e => namedSet.has(e.actor)).length > 0
                      ? actionLabel(
                          draft.preflopActions.filter(e => namedSet.has(e.actor)).slice(-1)[0].action,
                          draft.preflopActions.filter(e => namedSet.has(e.actor)).slice(-1)[0].sizingBB,
                          showChips, bigBlind,
                        )
                      : '—'}
                  </Text>
                </View>
                <View style={styles.solverRow}>
                  <Text style={styles.solverRowLabel}>Solver recommends:</Text>
                  <TextInput
                    style={styles.solverInlineInput}
                    value={review.solverRecommends}
                    onChangeText={v => update({ solverRecommends: v })}
                    placeholder="e.g. Check 70% / Bet 30%"
                    placeholderTextColor={C.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                <View style={styles.solverRow}>
                  <Text style={styles.solverRowLabel}>EV difference:</Text>
                  <TextInput
                    style={styles.solverInlineInput}
                    value={review.evDifference}
                    onChangeText={v => update({ evDifference: v })}
                    placeholder="e.g. -0.3BB"
                    placeholderTextColor={C.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
              </View>

              {/* Overall notes */}
              <SubLabel text="Overall notes" mt={16} />
              <TextInput
                style={[styles.noteInput, { minHeight: 100 }]}
                multiline
                value={review.overallNotes}
                onChangeText={v => update({ overallNotes: v })}
                placeholder="What did you learn? Key takeaways…"
                placeholderTextColor={C.textSecondary}
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

            {/* COACH */}
            <View style={styles.card}>
              <SectionHeader title="Coach" />

              <View style={styles.sharingRow}>
                <Pressable style={styles.sharingBtn}
                  onPress={() => Alert.alert('Coming soon', 'Study rooms will be available in a future update.')}>
                  <Text style={styles.sharingBtnText}>📤 Send to coach</Text>
                </Pressable>
                <Pressable
                  onPress={() => update({ requestCoachReview: !review.requestCoachReview })}
                  style={[styles.sharingBtn,
                    review.requestCoachReview && { backgroundColor: C.tint + '22', borderColor: C.tint, borderWidth: 1.5 }]}>
                  <Text style={[styles.sharingBtnText, review.requestCoachReview && { color: C.tint }]}>
                    {review.requestCoachReview ? '⚑ Review requested' : '⚑ Request feedback'}
                  </Text>
                </Pressable>
              </View>

              <SubLabel text="Coach feedback" mt={12} />
              <TextInput
                style={[styles.noteInput, { minHeight: 80 }]}
                multiline
                value={review.coachFeedback}
                onChangeText={v => update({ coachFeedback: v })}
                placeholder="Coach feedback appears here…"
                placeholderTextColor={C.textSecondary}
                textAlignVertical="top"
              />
              <DoneLink />

              <View style={[styles.sharingRow, { marginTop: 8 }]}>
                <Pressable style={styles.sharingBtn} onPress={handleShare}>
                  <Text style={styles.sharingBtnText}>↗ Share hand</Text>
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
          {showReviewedMsg ? (
            <View style={styles.reviewedBanner}>
              <View>
                <Text style={styles.reviewedBannerText}>✓ Reviewed</Text>
                {review.reviewedAt && (
                  <Text style={styles.reviewedDate}>{shortDate(review.reviewedAt)}</Text>
                )}
              </View>
              <View style={styles.reviewedActions}>
                <Pressable onPress={() => Alert.alert('Coming soon', 'Study rooms in a future update.')}>
                  <Text style={styles.reviewedStudyRoom}>Add to study room</Text>
                </Pressable>
                <Pressable onPress={() => { update({ markedReviewed: false, reviewedAt: undefined }); setRevMsg(false); }}>
                  <Text style={styles.reviewedUndo}>Undo</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={handleMarkReviewed} style={styles.reviewBtn}>
              <Text style={styles.reviewBtnText}>Mark as Reviewed</Text>
            </Pressable>
          )}
        </View>

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
  noteIcon:       { fontSize: 12, color: C.tint },
  flagBadge:      { backgroundColor: C.tint, borderRadius: 9, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  flagBadgeText:  { fontSize: 9, fontWeight: '800', color: '#fff' },
  actionRowRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText:     { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  expandArrow:    { fontSize: 9, color: C.textSecondary },

  // Pill
  pill:       { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pillText:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  // Street note toggle
  streetNoteToggle:     { paddingVertical: 8 },
  streetNoteToggleText: { fontSize: 12, fontWeight: '600', color: C.tint },

  // Note editor
  noteEditor: { backgroundColor: C.backgroundElement, borderRadius: 10, padding: 10, gap: 8, marginVertical: 2 },
  noteInput:  { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.backgroundSelected, padding: 10, fontSize: 14, color: C.text, minHeight: 80 },
  doneLinkWrap: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 2 },
  doneLinkText: { fontSize: 13, fontWeight: '600', color: C.tint },

  // Prompts
  promptScroll:   { flexGrow: 0 },
  promptRow:      { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  promptChip:     { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5, borderWidth: 1, borderColor: C.backgroundSelected },
  promptChipText: { fontSize: 11, fontWeight: '600', color: C.tint },

  // Flag toggle button
  flagToggleBtn:     { alignSelf: 'flex-start' },
  flagToggleBtnText: { fontSize: 11, fontWeight: '600', color: C.tint },

  // Flag row (active)
  flagRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },

  // Flag tag
  flagTag:       { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  flagTagText:   { fontSize: 10, fontWeight: '700' },
  flagTagRemove: { fontSize: 14, fontWeight: '700', lineHeight: 16 },

  // Flag grid
  flagGrid:     { gap: 5 },
  flagGridItem: { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6 },
  flagGridText: { fontSize: 12, fontWeight: '600' },

  // Custom flag
  customFlagRow:    { flexDirection: 'row', gap: 6, alignItems: 'center' },
  customFlagInput:  { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: C.backgroundSelected, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: C.text },
  customFlagAdd:    { backgroundColor: C.tint, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  customFlagAddText:{ fontSize: 12, fontWeight: '700', color: '#fff' },

  // Result
  resultBanner:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14 },
  resultWon:     { backgroundColor: '#E6F4EC' },
  resultLost:    { backgroundColor: '#FCE8E8' },
  resultUnknown: { backgroundColor: C.backgroundElement },
  resultIcon:    { fontSize: 22, fontWeight: '800' },
  resultText:    { fontSize: 15, fontWeight: '700' },

  // Rating
  ratingRow:    { flexDirection: 'row', gap: 8 },
  ratingBtn:    { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  ratingBtnText:{ fontSize: 12, fontWeight: '700' },

  // Mistake
  mistakeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  mistakeBtn:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6 },
  mistakeBtnText:{ fontSize: 12, fontWeight: '700' },

  // Concept tags
  tagGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  conceptTag:      { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  conceptTagText:  { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  conceptTagActive:{ color: C.tint, fontWeight: '700' },
  customTagRow:    { flexDirection: 'row' },
  customTagInput:  { flex: 1, backgroundColor: C.backgroundElement, borderRadius: 8, borderWidth: 1, borderColor: C.backgroundSelected, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: C.text },

  // Solver
  solverGrid:        { backgroundColor: C.backgroundElement, borderRadius: 10, padding: 10, gap: 0 },
  solverRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.backgroundSelected },
  solverRowLabel:    { fontSize: 12, fontWeight: '700', color: C.textSecondary, width: 140 },
  solverRowValue:    { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  solverInlineInput: { flex: 1, fontSize: 13, color: C.text, padding: 0, fontWeight: '600' },

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

  // Footer
  footer:             { paddingHorizontal: Spacing.three, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.backgroundElement },
  reviewBtn:          { backgroundColor: C.tint, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  reviewBtnText:      { fontSize: 16, fontWeight: '800', color: '#D4EDDA' },
  reviewedBanner:     { backgroundColor: '#E6F4EC', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewedBannerText: { fontSize: 15, fontWeight: '700', color: '#1B4332' },
  reviewedDate:       { fontSize: 11, color: '#2E7D52', marginTop: 2 },
  reviewedActions:    { flexDirection: 'row', gap: 14, alignItems: 'center' },
  reviewedStudyRoom:  { fontSize: 12, fontWeight: '700', color: C.tint },
  reviewedUndo:       { fontSize: 12, fontWeight: '600', color: '#2E7D52' },
});
