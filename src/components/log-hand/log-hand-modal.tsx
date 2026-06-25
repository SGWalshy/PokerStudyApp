import { useState } from 'react';
import {
  KeyboardAvoidingView,
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
import { CardFace, CardPicker } from './card-picker';
import { TableDiagram } from './table-diagram';
import {
  CardType,
  HandDraft,
  INITIAL_DRAFT,
  POSITION_LABELS,
  PreflopAction,
  ResultType,
  StreetAction,
  TagType,
  holeCardsLabel,
  inferLastStreet,
  inferPotType,
} from './types';

const C = Colors.light;

// ── Shared primitives ────────────────────────────────────────────────────────

function BigBtn({
  label,
  active,
  onPress,
  variant = 'default',
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  variant?: 'default' | 'danger' | 'outline';
}) {
  const bg = active
    ? C.tint
    : variant === 'danger'
    ? '#C04040'
    : C.backgroundElement;
  const fg = active ? C.tintText : variant === 'danger' ? '#fff' : C.text;
  const border = variant === 'outline' && !active ? { borderWidth: 1.5, borderColor: C.tint } : {};
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bigBtn, { backgroundColor: bg }, border, pressed && styles.dimmed]}>
      <Text style={[styles.bigBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function SizingInput({
  value,
  onChange,
  suffix = 'BB',
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <View style={styles.sizingRow}>
      <TextInput
        style={styles.sizingInput}
        value={value > 0 ? String(value) : ''}
        onChangeText={(t) => onChange(Number(t.replace(/[^0-9.]/g, '')) || 0)}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={C.textSecondary}
      />
      <Text style={styles.sizingSuffix}>{suffix}</Text>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

// ── Step header: progress bar + back button ──────────────────────────────────

const TOTAL_STEPS = 10;

function StepHeader({
  step,
  title,
  onBack,
  onClose,
}: {
  step: number;
  title: string;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.headerWrap}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressed && styles.dimmed]}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.stepTitle}>{title}</Text>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && styles.dimmed]}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { flex: step / TOTAL_STEPS }]} />
        <View style={{ flex: 1 - step / TOTAL_STEPS }} />
      </View>
      <Text style={styles.stepCount}>Step {step} of {TOTAL_STEPS}</Text>
    </View>
  );
}

// ── Step 1: Game Type ────────────────────────────────────────────────────────

function StepGameType({ draft, set, onNext }: StepProps) {
  const [customStakes, setCustomStakes] = useState(draft.stakes);

  const CASH_PRESETS = ['1/2', '2/5', '5/10', '1/3'];

  const selectStakes = (s: string) => {
    const bb = parseFloat(s.split('/')[1] ?? '2') || 2;
    set({ stakes: s, bigBlind: bb, gameType: 'cash' });
  };

  return (
    <StepScroll>
      <Label text="What kind of game?" />
      <View style={styles.twoCol}>
        <BigBtn label="Cash Game"   active={draft.gameType === 'cash'}       onPress={() => set({ gameType: 'cash' })} />
        <BigBtn label="Tournament"  active={draft.gameType === 'tournament'}  onPress={() => set({ gameType: 'tournament' })} />
      </View>

      {draft.gameType === 'cash' && (
        <>
          <Label text="Stakes" />
          <View style={styles.chipRow}>
            {CASH_PRESETS.map((s) => (
              <Pressable
                key={s}
                onPress={() => selectStakes(s)}
                style={({ pressed }) => [styles.chip, draft.stakes === s && styles.chipActive, pressed && styles.dimmed]}>
                <Text style={[styles.chipText, draft.stakes === s && styles.chipTextActive]}>${s}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => set({ stakes: 'custom' })}
              style={({ pressed }) => [styles.chip, draft.stakes === 'custom' && styles.chipActive, pressed && styles.dimmed]}>
              <Text style={[styles.chipText, draft.stakes === 'custom' && styles.chipTextActive]}>Other</Text>
            </Pressable>
          </View>
          {draft.stakes === 'custom' && (
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2/5 or 10/25"
                placeholderTextColor={C.textSecondary}
                value={customStakes === 'custom' ? '' : customStakes}
                onChangeText={(v) => {
                  setCustomStakes(v);
                  const bb = parseFloat(v.split('/')[1] ?? '2') || 2;
                  set({ stakes: v, bigBlind: bb });
                }}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          )}
        </>
      )}

      {draft.gameType === 'tournament' && (
        <>
          <Label text="Blind level (e.g. 200/400)" />
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="200/400"
              placeholderTextColor={C.textSecondary}
              value={draft.stakes}
              onChangeText={(v) => {
                const bb = parseFloat(v.split('/')[1] ?? '2') || 2;
                set({ stakes: v, bigBlind: bb });
              }}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <Label text="Ante (BB)" />
          <SizingInput value={draft.preflopSizingBB} onChange={(v) => set({ preflopSizingBB: v })} />
        </>
      )}

      <NextBtn onPress={onNext} disabled={!draft.gameType || !draft.stakes} />
    </StepScroll>
  );
}

// ── Step 2: Table Setup ──────────────────────────────────────────────────────

function StepTableSetup({ draft, set, onNext }: StepProps) {
  const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9];
  const UNITS: Array<'BB' | 'Chips' | '$'> = ['BB', 'Chips', '$'];

  return (
    <StepScroll>
      <Label text="Players at table" />
      <View style={styles.chipRow}>
        {COUNTS.map((n) => (
          <Pressable
            key={n}
            onPress={() => set({ playerCount: n })}
            style={({ pressed }) => [styles.chip, draft.playerCount === n && styles.chipActive, pressed && styles.dimmed]}>
            <Text style={[styles.chipText, draft.playerCount === n && styles.chipTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Label text="Effective stack" />
      <View style={styles.unitToggle}>
        {UNITS.map((u) => (
          <Pressable
            key={u}
            onPress={() => set({ stackUnit: u })}
            style={[styles.unitBtn, draft.stackUnit === u && styles.unitBtnActive]}>
            <Text style={[styles.unitText, draft.stackUnit === u && styles.unitTextActive]}>{u}</Text>
          </Pressable>
        ))}
      </View>
      <SizingInput
        value={draft.effectiveStack}
        onChange={(v) => set({ effectiveStack: v })}
        suffix={draft.stackUnit}
      />

      <NextBtn onPress={onNext} disabled={draft.effectiveStack <= 0} />
    </StepScroll>
  );
}

// ── Step 3: Position ─────────────────────────────────────────────────────────

function StepPosition({ draft, set, onNext }: StepProps) {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos  = draft.heroSeat !== null ? labels[draft.heroSeat]  ?? '' : '';
  const villPos  = draft.villainSeats.map((s) => labels[s]).join(', ');

  const handleSeat = (i: number) => {
    if (draft.heroSeat === null) {
      set({ heroSeat: i });
    } else if (draft.heroSeat === i) {
      set({ heroSeat: null, villainSeats: [] });
    } else if (draft.villainSeats.includes(i)) {
      set({ villainSeats: draft.villainSeats.filter((s) => s !== i) });
    } else {
      set({ villainSeats: [...draft.villainSeats, i] });
    }
  };

  return (
    <StepScroll>
      <Label text="Tap your seat, then tap villain seat(s)" />
      <TableDiagram
        playerCount={draft.playerCount}
        heroSeat={draft.heroSeat}
        villainSeats={draft.villainSeats}
        onSeatPress={handleSeat}
      />
      <View style={styles.positionSummary}>
        <View style={styles.positionPill}>
          <Text style={styles.positionPillLabel}>You</Text>
          <Text style={styles.positionPillValue}>{heroPos || '—'}</Text>
        </View>
        <Text style={styles.vsText}>vs</Text>
        <View style={styles.positionPill}>
          <Text style={styles.positionPillLabel}>Villain</Text>
          <Text style={styles.positionPillValue}>{villPos || '—'}</Text>
        </View>
      </View>
      <NextBtn onPress={onNext} disabled={draft.heroSeat === null} />
    </StepScroll>
  );
}

// ── Step 4: Your Hand ────────────────────────────────────────────────────────

function StepCards({ draft, set, onNext, onSkip }: StepProps & { onSkip: () => void }) {
  const [slot, setSlot] = useState(0);

  const cards: (CardType | null)[] = [draft.card1, draft.card2];

  const handlePick = (slotIdx: number, card: CardType) => {
    if (slotIdx === 0) set({ card1: card });
    else set({ card2: card });
  };

  const handleClear = (slotIdx: number) => {
    if (slotIdx === 0) set({ card1: null });
    else set({ card2: null });
  };

  return (
    <StepScroll>
      <Label text="Your hole cards" />
      <CardPicker
        cards={cards}
        activeSlot={slot}
        onSlotPress={setSlot}
        onCardPicked={handlePick}
        onClear={handleClear}
      />
      <NextBtn onPress={onNext} disabled={!draft.card1 || !draft.card2} />
      <SkipBtn onPress={onSkip} />
    </StepScroll>
  );
}

// ── Step 5: Preflop ──────────────────────────────────────────────────────────

const PREFLOP_ACTIONS: Array<{ key: PreflopAction; label: string }> = [
  { key: 'fold',   label: 'Fold'   },
  { key: 'limp',   label: 'Limp'   },
  { key: 'call',   label: 'Call'   },
  { key: 'raise',  label: 'Raise'  },
  { key: '3bet',   label: '3-Bet'  },
  { key: '4bet',   label: '4-Bet'  },
  { key: 'allin',  label: 'All In' },
];

function StepPreflop({ draft, set, onNext, onFold }: StepProps & { onFold: () => void }) {
  const labels  = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? labels[draft.heroSeat] ?? 'Hero' : 'Hero';
  const villPos = draft.villainSeats.map((s) => labels[s]).join(', ') || 'Villain';

  const selectAction = (a: PreflopAction) => {
    const newPotType = inferPotType(a, draft.potType);
    set({ preflopAction: a, potType: newPotType });
    if (a === 'fold') onFold();
  };

  const needsSizing = ['raise', '3bet', '4bet', 'allin'].includes(draft.preflopAction ?? '');

  return (
    <StepScroll>
      <View style={styles.streetContext}>
        <CardFace card={draft.card1} size="sm" />
        <CardFace card={draft.card2} size="sm" />
        <Text style={styles.streetCtxText}>{heroPos} vs {villPos} · Preflop</Text>
      </View>

      <Label text={`${heroPos}'s preflop action`} />
      <View style={styles.actionGrid}>
        {PREFLOP_ACTIONS.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => selectAction(key)}
            style={({ pressed }) => [
              styles.actionBtn,
              draft.preflopAction === key && styles.actionBtnActive,
              key === 'fold' && styles.actionBtnFold,
              pressed && styles.dimmed,
            ]}>
            <Text style={[
              styles.actionBtnText,
              draft.preflopAction === key && styles.actionBtnTextActive,
              key === 'fold' && styles.actionBtnTextFold,
            ]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {needsSizing && (
        <>
          <Label text="Sizing (BB)" />
          <SizingInput value={draft.preflopSizingBB} onChange={(v) => set({ preflopSizingBB: v })} />
        </>
      )}

      <View style={styles.potTypeBadge}>
        <Text style={styles.potTypeLabel}>Pot type: </Text>
        <Text style={styles.potTypeValue}>{draft.potType}</Text>
      </View>

      <NextBtn onPress={onNext} disabled={!draft.preflopAction || draft.preflopAction === 'fold'} />
    </StepScroll>
  );
}

// ── Steps 6–8: Street (Flop / Turn / River) ──────────────────────────────────

const STREET_ACTIONS: Array<{ key: StreetAction; label: string }> = [
  { key: 'fold',  label: 'Fold'   },
  { key: 'check', label: 'Check'  },
  { key: 'call',  label: 'Call'   },
  { key: 'bet',   label: 'Bet'    },
  { key: 'raise', label: 'Raise'  },
  { key: 'allin', label: 'All In' },
];

interface StepStreetProps extends StepProps {
  street: 'flop' | 'turn' | 'river';
  onFold: () => void;
  onNext: () => void;
}

function StepStreet({ street, draft, set, onFold, onNext }: StepStreetProps) {
  const [boardSlot, setBoardSlot] = useState(0);
  const titleMap = { flop: 'Flop', turn: 'Turn', river: 'River' };
  const title    = titleMap[street];

  const boardCards: (CardType | null)[] =
    street === 'flop'
      ? [...draft.flopCards]
      : street === 'turn'
      ? [draft.turnCard]
      : [draft.riverCard];

  const boardCount = street === 'flop' ? 3 : 1;

  const action: StreetAction | null =
    street === 'flop' ? draft.flopAction :
    street === 'turn' ? draft.turnAction : draft.riverAction;

  const sizing: number =
    street === 'flop' ? draft.flopSizingBB :
    street === 'turn' ? draft.turnSizingBB : draft.riverSizingBB;

  const setAction = (a: StreetAction) => {
    if (street === 'flop')  set({ flopAction: a,  lastStreet: 'flop'  });
    if (street === 'turn')  set({ turnAction: a,  lastStreet: 'turn'  });
    if (street === 'river') set({ riverAction: a, lastStreet: 'river' });
    if (a === 'fold') {
      set({ foldedOn: street });
      onFold();
    }
  };

  const setSizing = (v: number) => {
    if (street === 'flop')  set({ flopSizingBB: v });
    if (street === 'turn')  set({ turnSizingBB: v });
    if (street === 'river') set({ riverSizingBB: v });
  };

  const setBoardCard = (slotIdx: number, card: CardType) => {
    if (street === 'flop') {
      const next: [CardType | null, CardType | null, CardType | null] = [...draft.flopCards];
      next[slotIdx] = card;
      set({ flopCards: next });
    } else if (street === 'turn') {
      set({ turnCard: card });
    } else {
      set({ riverCard: card });
    }
  };

  const clearBoardCard = (slotIdx: number) => {
    if (street === 'flop') {
      const next: [CardType | null, CardType | null, CardType | null] = [...draft.flopCards];
      next[slotIdx] = null;
      set({ flopCards: next });
    } else if (street === 'turn') {
      set({ turnCard: null });
    } else {
      set({ riverCard: null });
    }
  };

  const needsSizing = ['bet', 'raise', 'allin'].includes(action ?? '');

  const labels  = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? labels[draft.heroSeat] ?? 'Hero' : 'Hero';

  return (
    <StepScroll>
      {/* Board + hero cards context */}
      <View style={styles.streetContext}>
        <CardFace card={draft.card1} size="sm" />
        <CardFace card={draft.card2} size="sm" />
        {street !== 'flop' && (
          <>
            {draft.flopCards.map((c, i) => <CardFace key={i} card={c} size="sm" />)}
            {street === 'river' && <CardFace card={draft.turnCard} size="sm" />}
          </>
        )}
      </View>

      <Label text={`${title} board cards (optional)`} />
      <CardPicker
        cards={boardCards}
        activeSlot={boardSlot}
        onSlotPress={setBoardSlot}
        onCardPicked={setBoardCard}
        onClear={clearBoardCard}
        cardSize="md"
      />

      <Label text={`${heroPos}'s ${title.toLowerCase()} action`} />
      <View style={styles.actionGrid}>
        {STREET_ACTIONS.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setAction(key)}
            style={({ pressed }) => [
              styles.actionBtn,
              action === key && styles.actionBtnActive,
              key === 'fold' && styles.actionBtnFold,
              pressed && styles.dimmed,
            ]}>
            <Text style={[
              styles.actionBtnText,
              action === key && styles.actionBtnTextActive,
              key === 'fold' && styles.actionBtnTextFold,
            ]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {needsSizing && (
        <>
          <Label text="Sizing (BB)" />
          <SizingInput value={sizing} onChange={setSizing} />
        </>
      )}

      <NextBtn
        onPress={onNext}
        label={street === 'river' ? 'Continue to Result' : `Continue to ${street === 'flop' ? 'Turn' : 'River'}`}
        disabled={!action || action === 'fold'}
      />
    </StepScroll>
  );
}

// ── Step 9: Result ───────────────────────────────────────────────────────────

function StepResult({ draft, set, onNext }: StepProps) {
  const [showVillainCards, setShowVillainCards] = useState(false);
  const [villSlot, setVillSlot] = useState(0);

  const RESULTS: Array<{ key: ResultType; label: string; color: string }> = [
    { key: 'won',    label: '🏆 Won Pot',  color: '#2E7D52' },
    { key: 'lost',   label: '📉 Lost',      color: '#C04040' },
    { key: 'folded', label: '🏳 Folded',    color: C.textSecondary },
  ];

  const villainCards: (CardType | null)[] = [draft.villainCard1, draft.villainCard2];

  const setVillainCard = (slotIdx: number, card: CardType) => {
    if (slotIdx === 0) set({ villainCard1: card });
    else set({ villainCard2: card });
  };
  const clearVillainCard = (slotIdx: number) => {
    if (slotIdx === 0) set({ villainCard1: null });
    else set({ villainCard2: null });
  };

  return (
    <StepScroll>
      <Label text="Result" />
      {RESULTS.map(({ key, label, color }) => (
        <Pressable
          key={key}
          onPress={() => set({ result: key })}
          style={({ pressed }) => [
            styles.resultBtn,
            draft.result === key && { backgroundColor: color, borderColor: color },
            pressed && styles.dimmed,
          ]}>
          <Text style={[styles.resultBtnText, draft.result === key && { color: '#fff' }]}>
            {label}
          </Text>
        </Pressable>
      ))}

      <Label text="Final pot size (BB)" />
      <SizingInput value={draft.potSizeBB} onChange={(v) => set({ potSizeBB: v })} />

      <Label text="Was it all-in?" />
      <View style={styles.twoCol}>
        <BigBtn label="Yes" active={draft.wasAllIn}  onPress={() => set({ wasAllIn: true  })} />
        <BigBtn label="No"  active={!draft.wasAllIn} onPress={() => set({ wasAllIn: false })} />
      </View>

      <Label text="Went to showdown?" />
      <View style={styles.twoCol}>
        <BigBtn
          label="Yes"
          active={draft.showdown}
          onPress={() => { set({ showdown: true }); setShowVillainCards(true); }}
        />
        <BigBtn
          label="No"
          active={!draft.showdown}
          onPress={() => { set({ showdown: false }); setShowVillainCards(false); }}
        />
      </View>

      {showVillainCards && (
        <>
          <Label text="Villain's cards (optional)" />
          <CardPicker
            cards={villainCards}
            activeSlot={villSlot}
            onSlotPress={setVillSlot}
            onCardPicked={setVillainCard}
            onClear={clearVillainCard}
            cardSize="md"
          />
        </>
      )}

      <NextBtn onPress={onNext} disabled={!draft.result} />
    </StepScroll>
  );
}

// ── Step 10: Tag & Save ───────────────────────────────────────────────────────

const TAGS: Array<{ key: TagType; emoji: string; label: string }> = [
  { key: 'review',      emoji: '🚩', label: 'Review Later' },
  { key: 'good',        emoji: '✓',  label: 'Good Play'    },
  { key: 'unsure',      emoji: '❓', label: 'Unsure'       },
  { key: 'interesting', emoji: '💡', label: 'Interesting'  },
];

interface StepTagProps extends StepProps {
  onSave: () => void;
}

function StepTag({ draft, set, onSave }: StepTagProps) {
  const labels  = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? labels[draft.heroSeat] ?? '?' : '?';
  const villPos = draft.villainSeats.map((s) => labels[s]).join(', ') || '?';
  const cards   = holeCardsLabel(draft.card1, draft.card2);
  const street  = inferLastStreet(draft);

  return (
    <StepScroll>
      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{heroPos} vs {villPos} — {cards}</Text>
        <Text style={styles.summaryMeta}>{draft.potType} · {street} · {draft.potSizeBB} BB pot</Text>
        <Text style={[styles.summaryResult, draft.result === 'won' ? styles.resultWin : styles.resultLoss]}>
          {draft.result === 'won' ? '🏆 Won' : draft.result === 'folded' ? '🏳 Folded' : '📉 Lost'}
        </Text>
      </View>

      <Label text="Tag this hand" />
      <View style={styles.tagGrid}>
        {TAGS.map(({ key, emoji, label }) => (
          <Pressable
            key={key}
            onPress={() => set({ tag: key })}
            style={({ pressed }) => [
              styles.tagBtn,
              draft.tag === key && styles.tagBtnActive,
              pressed && styles.dimmed,
            ]}>
            <Text style={styles.tagEmoji}>{emoji}</Text>
            <Text style={[styles.tagLabel, draft.tag === key && styles.tagLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Label text="Notes (optional)" />
      <TextInput
        style={styles.notesInput}
        placeholder="One line about this hand…"
        placeholderTextColor={C.textSecondary}
        value={draft.notes}
        onChangeText={(v) => set({ notes: v })}
        multiline
        maxLength={200}
      />

      <Pressable
        onPress={onSave}
        style={({ pressed }) => [styles.saveBtn, pressed && styles.dimmed]}>
        <Text style={styles.saveBtnText}>Save Hand</Text>
      </Pressable>
    </StepScroll>
  );
}

// ── Shared scroll wrapper ─────────────────────────────────────────────────────

function StepScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.stepScroll}
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

function NextBtn({
  onPress,
  disabled,
  label = 'Continue',
}: {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.nextBtn, disabled && styles.nextBtnOff, pressed && styles.dimmed]}>
      <Text style={[styles.nextBtnText, disabled && styles.nextBtnTextOff]}>{label}</Text>
    </Pressable>
  );
}

function SkipBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.skipBtn, pressed && styles.dimmed]}>
      <Text style={styles.skipBtnText}>Skip — don't record cards</Text>
    </Pressable>
  );
}

// ── Prop types ────────────────────────────────────────────────────────────────

interface StepProps {
  draft: HandDraft;
  set: (updates: Partial<HandDraft>) => void;
  onNext: () => void;
  onBack?: () => void;
}

// ── Step titles ───────────────────────────────────────────────────────────────

const STEP_TITLES: Record<number, string> = {
  1: 'Game Type',
  2: 'Table Setup',
  3: 'Position',
  4: 'Your Hand',
  5: 'Preflop',
  6: 'Flop',
  7: 'Turn',
  8: 'River',
  9: 'Result',
  10: 'Tag & Save',
};

// ── Main modal ────────────────────────────────────────────────────────────────

export interface LogHandModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: HandDraft) => void;
}

export function LogHandModal({ visible, onClose, onSave }: LogHandModalProps) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<HandDraft>(INITIAL_DRAFT);

  const set = (updates: Partial<HandDraft>) =>
    setDraft((prev) => ({ ...prev, ...updates }));

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const back = () => {
    if (step === 1) { onClose(); return; }
    setStep((s) => s - 1);
  };

  const goToResult = () => setStep(9);

  const handleClose = () => {
    setStep(1);
    setDraft(INITIAL_DRAFT);
    onClose();
  };

  const handleSave = () => {
    onSave(draft);
    setStep(1);
    setDraft(INITIAL_DRAFT);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <StepHeader
            step={step}
            title={STEP_TITLES[step] ?? ''}
            onBack={back}
            onClose={handleClose}
          />

          {step === 1  && <StepGameType    draft={draft} set={set} onNext={next} />}
          {step === 2  && <StepTableSetup  draft={draft} set={set} onNext={next} />}
          {step === 3  && <StepPosition    draft={draft} set={set} onNext={next} />}
          {step === 4  && (
            <StepCards
              draft={draft} set={set}
              onNext={next}
              onSkip={() => { set({ card1: null, card2: null }); next(); }}
            />
          )}
          {step === 5  && (
            <StepPreflop
              draft={draft} set={set}
              onNext={next}
              onFold={goToResult}
            />
          )}
          {step === 6  && (
            <StepStreet street="flop"  draft={draft} set={set} onNext={next} onFold={goToResult} />
          )}
          {step === 7  && (
            <StepStreet street="turn"  draft={draft} set={set} onNext={next} onFold={goToResult} />
          )}
          {step === 8  && (
            <StepStreet street="river" draft={draft} set={set} onNext={next} onFold={goToResult} />
          )}
          {step === 9  && <StepResult draft={draft} set={set} onNext={next} />}
          {step === 10 && <StepTag    draft={draft} set={set} onNext={next} onSave={handleSave} />}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  // Header
  headerWrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: C.backgroundElement,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 56 },
  backIcon: { fontSize: 22, color: C.tint, fontWeight: '300', lineHeight: 24 },
  backLabel: { fontSize: 15, color: C.tint, fontWeight: '500' },
  stepTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  closeBtn: { minWidth: 56, alignItems: 'flex-end' },
  closeIcon: { fontSize: 15, color: C.textSecondary, fontWeight: '600' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.backgroundElement,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: C.tint, borderRadius: 2 },
  stepCount: { fontSize: 11, color: C.textSecondary, marginTop: 4, textAlign: 'right' },

  // Step scroll
  stepScroll: { flex: 1 },
  stepContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: 40,
    gap: Spacing.three,
  },

  // Label
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: -Spacing.two,
  },

  // BigBtn
  bigBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  bigBtnText: { fontSize: 16, fontWeight: '700' },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.backgroundElement,
  },
  chipActive: { backgroundColor: C.tint },
  chipText: { fontSize: 15, fontWeight: '700', color: C.text },
  chipTextActive: { color: C.tintText },

  // Two-column
  twoCol: { flexDirection: 'row', gap: 10 },

  // Unit toggle
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: C.backgroundElement,
    borderRadius: 10,
    padding: 3,
    gap: 3,
    marginBottom: -Spacing.two,
  },
  unitBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  unitBtnActive: { backgroundColor: C.tint },
  unitText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  unitTextActive: { color: C.tintText },

  // Sizing input
  sizingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  sizingInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    paddingVertical: 10,
    textAlign: 'center',
  },
  sizingSuffix: { fontSize: 16, fontWeight: '600', color: C.textSecondary },

  // Text input
  inputWrap: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  textInput: {
    fontSize: 16,
    color: C.text,
    paddingVertical: 14,
  },

  // Position summary
  positionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
  },
  positionPill: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  positionPillLabel: { fontSize: 10, fontWeight: '600', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  positionPillValue: { fontSize: 18, fontWeight: '800', color: C.tint, marginTop: 2 },
  vsText: { fontSize: 14, fontWeight: '600', color: C.textSecondary },

  // Street context strip
  streetContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    padding: 12,
  },
  streetCtxText: { fontSize: 13, color: C.textSecondary, fontWeight: '500', marginLeft: 4, flex: 1 },

  // Action grid
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: C.backgroundElement,
    minWidth: '30%',
    flexGrow: 1,
    alignItems: 'center',
  },
  actionBtnActive: { backgroundColor: C.tint },
  actionBtnFold: { backgroundColor: '#FEE8E8' },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: C.text },
  actionBtnTextActive: { color: C.tintText },
  actionBtnTextFold: { color: '#C04040' },

  // Pot type badge
  potTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  potTypeLabel: { fontSize: 13, color: C.textSecondary },
  potTypeValue: { fontSize: 13, fontWeight: '700', color: C.tint },

  // Result buttons
  resultBtn: {
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.backgroundElement,
  },
  resultBtnText: { fontSize: 17, fontWeight: '700', color: C.text },

  // Summary card
  summaryCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    padding: Spacing.three,
    gap: 4,
  },
  summaryTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  summaryMeta: { fontSize: 13, color: C.textSecondary },
  summaryResult: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  resultWin:  { color: '#2E7D52' },
  resultLoss: { color: '#C04040' },

  // Tags
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagBtn: {
    flex: 1,
    minWidth: '44%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: C.backgroundElement,
    alignItems: 'center',
    gap: 6,
  },
  tagBtnActive: { backgroundColor: C.tint },
  tagEmoji: { fontSize: 22 },
  tagLabel: { fontSize: 13, fontWeight: '600', color: C.text },
  tagLabelActive: { color: C.tintText },

  // Notes
  notesInput: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Save button
  saveBtn: {
    backgroundColor: C.tint,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 18, fontWeight: '800', color: C.tintText },

  // Next / Skip
  nextBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
  },
  nextBtnOff: { backgroundColor: C.backgroundElement },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: C.tintText },
  nextBtnTextOff: { color: C.textSecondary },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipBtnText: { fontSize: 14, color: C.textSecondary, textDecorationLine: 'underline' },

  dimmed: { opacity: 0.65 },
});
