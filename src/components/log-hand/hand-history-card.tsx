import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ActionEntry,
  CardType,
  HandDraft,
  POSITION_LABELS,
  Suit,
  autoHandName,
  computeFoldWinNet,
  computeHandMath,
  computeHandOutcome,
  fmtCompact,
  fmtDualAmount,
  heroLabel,
  isAllInRunout,
  villainLabel,
} from './types';

// ── Data prep ────────────────────────────────────────────────────────────────
// Everything the visual card needs, derived once from the logged hand so the
// render below stays pure layout. Shares its pot/investment math with the
// text export (computeHandMath) so the two can never disagree.

export type PillKind = 'raise' | 'call' | 'check' | 'bet' | 'fold' | 'allin';

export interface CardAction {
  playerLabel: string;
  text: string;
  kind: PillKind;
}

export interface CardStreetData {
  key: 'preflop' | 'flop' | 'turn' | 'river';
  label: string;
  boardText: string;   // '' for preflop
  potText: string;     // '' for preflop
  actions: CardAction[];
  runout: boolean;      // true → render "All in — run out" instead of actions
}

export interface CardVillainData {
  key: string;
  label: string;
  posLabel: string;
  stackText: string;
  cards: [CardType, CardType] | null; // only set once revealed at showdown
}

export interface CardData {
  title: string;
  metaText: string;
  heroName: string;
  heroPos: string;
  heroStackText: string;
  heroCards: [CardType | null, CardType | null];
  villains: CardVillainData[];
  board: (CardType | null)[]; // length 5, flop+turn+river in order
  potText: string;
  streets: CardStreetData[];
  resultText: string;
  resultColor: string;
  profitText: string | null;
  profitColor: string;
}

// A hand saved before some field existed can genuinely be missing it from
// storage — filling those in here, once, means every access below (most of
// which already assumes an object/array to index into) can't throw on a
// legacy record. This is what keeps the off-screen capture from silently
// hanging instead of ever producing an image.
function normalizeDraft(draft: HandDraft): HandDraft {
  return {
    ...draft,
    handName: draft.handName ?? '',
    villainNames: draft.villainNames ?? {},
    villainStacksBB: draft.villainStacksBB ?? {},
    villainHoleCards: draft.villainHoleCards ?? {},
    villainSeats: draft.villainSeats ?? [],
    flopCards: draft.flopCards ?? [null, null, null],
    preflopActions: draft.preflopActions ?? [],
    flopActions: draft.flopActions ?? [],
    turnActions: draft.turnActions ?? [],
    riverActions: draft.riverActions ?? [],
  };
}

export function buildCardData(rawDraft: HandDraft, now: Date, hideVillainCards = false): CardData {
  const draft = normalizeDraft(rawDraft);
  // Every amount on the card goes through this — a cash hand gets a $ sign,
  // a tournament a bare K/M-compact number, both followed by the BB
  // equivalent in brackets; never the word "chips".
  const fmtBB = (bb: number) => fmtDualAmount(bb, draft);
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? (labels[draft.heroSeat] ?? '?') : '?';
  const heroName = heroLabel(draft.heroName);
  const heroStackBB = draft.effectiveStackBB || draft.effectiveStack;

  const math = computeHandMath(draft);
  const { situation, liveVillains } = computeHandOutcome(draft);

  const posFor = (a: string): string => {
    if (a === 'hero') return heroPos;
    if (a.startsWith('villain')) {
      const vi = parseInt(a.replace('villain', ''), 10) - 1;
      return labels[draft.villainSeats[vi]] ?? '?';
    }
    return '?';
  };
  const nameFor = (a: string): string => {
    if (a === 'hero') return heroName;
    if (a.startsWith('villain')) return villainLabel(a, draft.villainNames);
    return '?';
  };
  // A villain stack that was never entered is a guess, not a fact — same
  // fallback-to-Hero's-stack convention the export and the live UI use.
  const stackKnown = (a: string) => a === 'hero' ? heroStackBB > 0 : !!(draft.villainStacksBB[a] && draft.villainStacksBB[a] > 0);
  const stackFor = (a: string) => a === 'hero' ? heroStackBB : (stackKnown(a) ? draft.villainStacksBB[a] : heroStackBB);

  // A villain who folded at any point isn't shown on the table at all —
  // not just their cards hidden, the whole chip + card slots disappear —
  // so the graphic only ever depicts whoever was still active. liveVillains
  // (from computeHandOutcome) already tracks exactly that: empty when
  // everyone folded before showdown, the full set when the hand actually
  // reached showdown.
  const villains: CardVillainData[] = liveVillains.map(vKey => {
    const [c1, c2] = draft.villainHoleCards[vKey] ?? [null, null];
    return {
      key: vKey,
      label: nameFor(vKey),
      posLabel: posFor(vKey),
      stackText: fmtBB(stackFor(vKey)),
      // `cards: null` already renders as a face-down CardBack pair below —
      // forcing it null when the toggle is on reuses that exact same look,
      // so there's nothing extra to build for the "hidden" state.
      cards: (!hideVillainCards && c1 && c2) ? [c1, c2] : null,
    };
  });

  const board: (CardType | null)[] = [...draft.flopCards, draft.turnCard, draft.riverCard];

  const namedOnly = (acts: ActionEntry[]) => acts.filter(e => e.actor === 'hero' || e.actor.startsWith('villain'));
  const buildActions = (acts: ActionEntry[], priorTotal: Record<string, number>): CardAction[] =>
    namedOnly(acts).map(e => {
      const n = `${nameFor(e.actor)} (${posFor(e.actor)})`;
      if (e.action === 'fold')  return { playerLabel: n, text: 'Folds', kind: 'fold' as const };
      if (e.action === 'check') return { playerLabel: n, text: 'Checks', kind: 'check' as const };

      const stack = stackFor(e.actor);
      const totalAfter = (priorTotal[e.actor] ?? 0) + e.sizingBB;
      const isAllIn = e.action === 'allin' || (stack > 0 && totalAfter >= stack - 0.01);
      if (isAllIn) return { playerLabel: n, text: `All in ${fmtBB(e.sizingBB)}`, kind: 'allin' as const };

      switch (e.action) {
        case 'call':  return { playerLabel: n, text: `Calls ${fmtBB(e.sizingBB)}`, kind: 'call' as const };
        case 'bet':   return { playerLabel: n, text: `Bets ${fmtBB(e.sizingBB)}`, kind: 'bet' as const };
        case 'raise': return { playerLabel: n, text: `Raises to ${fmtBB(e.sizingBB)}`, kind: 'raise' as const };
        default:      return { playerLabel: n, text: e.action, kind: 'call' as const };
      }
    });
  const boardStr = (cards: (CardType | null)[]) => cards.filter(Boolean).map(c => `${c!.rank}${c!.suit}`).join(' ');

  const streets: CardStreetData[] = [
    { key: 'preflop', label: 'PREFLOP', boardText: '', potText: '', actions: buildActions(draft.preflopActions, {}), runout: false },
  ];
  if (draft.flopCards.some(Boolean)) {
    streets.push({
      key: 'flop', label: 'FLOP',
      boardText: boardStr(draft.flopCards),
      potText: `Pot ${fmtBB(math.pfPotBB)}`,
      actions: buildActions(draft.flopActions, math.priorFlop),
      runout: draft.flopActions.length === 0 && isAllInRunout(draft, 'flop'),
    });
  }
  if (draft.turnCard) {
    streets.push({
      key: 'turn', label: 'TURN',
      boardText: boardStr([...draft.flopCards, draft.turnCard]),
      potText: `Pot ${fmtBB(math.flop.potBB)}`,
      actions: buildActions(draft.turnActions, math.priorTurn),
      runout: draft.turnActions.length === 0 && isAllInRunout(draft, 'turn'),
    });
  }
  if (draft.riverCard) {
    streets.push({
      key: 'river', label: 'RIVER',
      boardText: boardStr([...draft.flopCards, draft.turnCard, draft.riverCard]),
      potText: `Pot ${fmtBB(math.turn.potBB)}`,
      actions: buildActions(draft.riverActions, math.priorRiver),
      runout: draft.riverActions.length === 0 && isAllInRunout(draft, 'river'),
    });
  }

  // ── Result + net BB ─────────────────────────────────────────────────────
  const heroInvested = (math.pf.investedBB['hero'] ?? 0) + (math.flop.investedBB['hero'] ?? 0)
    + (math.turn.investedBB['hero'] ?? 0) + (math.river.investedBB['hero'] ?? 0);

  const GREEN = '#1B4332';
  const RED   = '#C0392B';
  const MUTED = '#6B5020';

  let resultText: string;
  let resultColor: string;
  let profitBB: number | null;

  if (situation === 'hero_folded') {
    resultText = `${heroName} folds`;
    resultColor = MUTED;
    profitBB = -heroInvested;
  } else if (situation === 'villain_folded') {
    resultText = `${heroName} wins`;
    resultColor = GREEN;
    profitBB = computeFoldWinNet(draft, math);
  } else if (draft.winner === 'hero' || draft.villainMucked) {
    // The only outcomes ever recorded here are ones the user actually
    // confirmed (villain mucked, or — on older hands — an explicit pick);
    // never assumed to be a Hero win.
    resultText = `${heroName} wins`;
    resultColor = GREEN;
    profitBB = math.finalPotBB - heroInvested;
  } else if (draft.winner) {
    resultText = `${villainLabel(draft.winner, draft.villainNames)} wins`;
    resultColor = RED;
    profitBB = -heroInvested;
  } else {
    // No recorded winner — state the pot, not a guess, and never label
    // this a "showdown".
    resultText = `Pot ${fmtBB(math.finalPotBB)}`;
    resultColor = MUTED;
    profitBB = null;
  }

  const profitText = profitBB === null ? null : `${profitBB >= 0 ? '+' : '-'}${fmtBB(Math.abs(profitBB))}`;
  const profitColor = profitBB === null ? MUTED : profitBB >= 0 ? GREEN : RED;

  // ── Header ────────────────────────────────────────────────────────────────
  const gameTypeText = draft.gameType === 'cash' ? 'Cash' : 'Tournament';
  const blindsText = draft.gameType === 'cash'
    ? `$${fmtCompact(draft.cashSB)}/$${fmtCompact(draft.cashBB)}`
    : `${fmtCompact(draft.tournamentSB)}/${fmtCompact(draft.tournamentBB)}`;
  const dateText = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const title = draft.handName.trim() || autoHandName(draft);
  const metaText = `${blindsText} · ${fmtBB(heroStackBB)} eff · ${gameTypeText} · ${dateText}`;

  return {
    title, metaText, heroName, heroPos, heroStackText: fmtBB(heroStackBB),
    heroCards: [draft.card1, draft.card2],
    villains, board, potText: `Pot ${fmtBB(math.finalPotBB)}`,
    streets, resultText, resultColor, profitText, profitColor,
  };
}

// ── Visual pieces ────────────────────────────────────────────────────────────

const CARD_W = 380;
const RED_SUIT_COLOR = '#C0392B';
const BLACK_SUIT_COLOR = '#1A1A14';
const suitColor = (s: Suit) => (s === '♥' || s === '♦') ? RED_SUIT_COLOR : BLACK_SUIT_COLOR;

function MiniCard({ card, size = 'md' }: { card: CardType | null; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 26 : 32;
  const h = w * 1.4;
  if (!card) return <View style={[styles.miniCardEmpty, { width: w, height: h }]} />;
  const color = suitColor(card.suit);
  return (
    <View style={[styles.miniCard, { width: w, height: h }]}>
      <Text style={[styles.miniCardRank, { color, fontSize: size === 'sm' ? 12 : 14 }]}>{card.rank}</Text>
      <Text style={[styles.miniCardSuit, { color, fontSize: size === 'sm' ? 10 : 12 }]}>{card.suit}</Text>
    </View>
  );
}

function CardBack({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 26 : 32;
  const h = w * 1.4;
  return <View style={[styles.cardBack, { width: w, height: h }]} />;
}

function PlayerChip({ text, bg }: { text: string; bg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={styles.chipText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const PILL_COLORS: Record<PillKind, string> = {
  raise: '#C0392B',
  call:  '#1B4332',
  check: '#1B4332',
  bet:   '#185FA5',
  fold:  '#9A9080',
  allin: '#C0392B',
};

function ActionPillView({ action }: { action: CardAction }) {
  const color = PILL_COLORS[action.kind];
  if (action.kind === 'allin') {
    return (
      <View style={[styles.pill, { backgroundColor: color, borderColor: color }]}>
        <Text style={[styles.pillText, { color: '#F5F0E8' }]}>{action.text}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{action.text}</Text>
    </View>
  );
}

// Sits alongside the share-card preview, wherever that preview is shown —
// flips the villain hole cards on the SAME rendered card between real and
// face-down in real time, before an image is ever captured for sharing.
export function VillainCardsToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={[toggleStyles.toggle, value && toggleStyles.toggleOn]}>
      <View style={[toggleStyles.dot, value && toggleStyles.dotOn]} />
      <Text style={[toggleStyles.text, value && toggleStyles.textOn]}>Hide Villain Cards</Text>
    </Pressable>
  );
}

const toggleStyles = StyleSheet.create({
  toggle: {
    flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#D4CAB8',
    backgroundColor: '#F5F0E8', paddingHorizontal: 12, paddingVertical: 7,
  },
  toggleOn: { backgroundColor: '#1B4332', borderColor: '#1B4332' },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#9A9080' },
  dotOn: { backgroundColor: '#D4EDDA' },
  text: { fontSize: 12, fontWeight: '700', color: '#6B5F4F' },
  textOn: { color: '#D4EDDA' },
});

export function HandHistoryCard({ draft, now, hideVillainCards = false }: { draft: HandDraft; now: Date; hideVillainCards?: boolean }) {
  // buildCardData is defensive against missing fields, but this is the last
  // line of defence: if something about this specific hand still throws,
  // render a plain fallback card rather than nothing. This is captured
  // off-screen by react-native-view-shot — a component that throws instead
  // of rendering leaves that capture with nothing to snapshot, which is
  // indistinguishable from the capture call hanging forever.
  let data: CardData;
  try {
    data = buildCardData(draft, now, hideVillainCards);
  } catch (err) {
    console.error('[HandHistoryCard] buildCardData failed, rendering fallback:', err);
    return (
      <View style={[styles.card, { alignItems: 'center', justifyContent: 'center', minHeight: 120 }]}>
        <Text style={styles.title}>Hand data unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{data.metaText}</Text>
        </View>
        <Text style={styles.brand}>POKER STUDY</Text>
      </View>
      <View style={styles.divider} />

      {/* Table graphic — hole cards float outside the rail, only their
          bottom ~12px tucked behind the felt, so the table reads as a real
          surface with cards resting against its edge rather than a sealed
          box everything is drawn inside. */}
      <View style={styles.tableSection}>
        <View style={styles.tableWrap}>
          {data.villains.length > 0 && (
            <View style={styles.villainFloatRow}>
              {data.villains.map(v => (
                <View key={v.key} style={styles.floatPair}>
                  {v.cards ? (
                    <>
                      <MiniCard card={v.cards[0]} size="sm" />
                      <MiniCard card={v.cards[1]} size="sm" />
                    </>
                  ) : (
                    <>
                      <CardBack size="sm" />
                      <CardBack size="sm" />
                    </>
                  )}
                </View>
              ))}
            </View>
          )}

          <View style={styles.tableOuter}>
            <View style={styles.tableInner}>
              {data.villains.length > 0 && (
                <View style={styles.chipRow}>
                  {data.villains.map(v => (
                    <PlayerChip key={v.key} text={`${v.label} (${v.posLabel}) · ${v.stackText}`} bg="#7A1E1E" />
                  ))}
                </View>
              )}

              <View style={styles.boardRow}>
                {data.board.map((c, i) => <MiniCard key={i} card={c} />)}
              </View>
              <View style={styles.potBadge}>
                <Text style={styles.potBadgeText}>{data.potText}</Text>
              </View>

              <PlayerChip text={`${data.heroName} (${data.heroPos}) · ${data.heroStackText}`} bg="#1B4332" />
            </View>
          </View>

          <View style={styles.heroFloatRow}>
            <MiniCard card={data.heroCards[0]} size="md" />
            <MiniCard card={data.heroCards[1]} size="md" />
          </View>
        </View>
      </View>

      {/* Streets */}
      <View style={styles.streetsBlock}>
        {data.streets.map(s => (
          <View key={s.key} style={styles.streetSection}>
            <View style={styles.streetHeaderRow}>
              <Text style={styles.streetLabel}>{s.label}</Text>
              {!!s.boardText && (
                <Text style={styles.streetBoard} numberOfLines={1}>{s.boardText} · {s.potText}</Text>
              )}
            </View>
            {s.runout ? (
              <Text style={styles.runoutText}>All in — run out</Text>
            ) : s.actions.length === 0 ? (
              <Text style={styles.noActionText}>No action recorded</Text>
            ) : (
              s.actions.map((a, i) => (
                <View key={i} style={styles.actionRow}>
                  <Text style={styles.actionPlayer} numberOfLines={1}>{a.playerLabel}</Text>
                  <ActionPillView action={a} />
                </View>
              ))
            )}
          </View>
        ))}
      </View>

      {/* Result */}
      <View style={styles.resultRow}>
        <Text style={[styles.resultText, { color: data.resultColor }]} numberOfLines={1}>{data.resultText}</Text>
        {data.profitText && (
          <Text style={[styles.profitText, { color: data.profitColor }]}>{data.profitText}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: '#F5F0E8',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D4CAB8',
  },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 13, fontWeight: '800', color: '#1A1A14' },
  meta:  { fontSize: 9, color: '#9A9080', marginTop: 2, fontWeight: '600' },
  brand: { fontSize: 10, fontWeight: '800', color: '#1B4332', letterSpacing: 1 },
  divider: { height: 1, backgroundColor: '#D4CAB8', marginVertical: 10 },

  // Villain cards float above the rail overlapping it by 12px (36.4px tall
  // at size "sm" − 12 tucked in = 24.4 poking out); Hero's float below by
  // the same 12px (44.8px at size "md" − 12 = 32.8 poking out). tableWrap's
  // margin is sized to give both room without touching the divider above
  // or the streets block below.
  tableSection: { marginTop: 4 },
  tableWrap: { marginTop: 26, marginBottom: 38 },

  tableOuter: {
    backgroundColor: '#1B3D2A',
    borderRadius: 60,
    padding: 6,
    // Explicit and LOWER than the float rows below — without it, Android's
    // elevation on those rows can still paint under a sibling that comes
    // later in the tree / has its own (undefined) stacking value.
    zIndex: 0,
    elevation: 0,
  },
  tableInner: {
    backgroundColor: '#3A7A50',
    borderRadius: 54,
    borderWidth: 1.5,
    borderColor: '#2D6040',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    // Without this, a child narrower than the table (the Hero chip, capped
    // by `chip`'s maxWidth) defaults to sitting flush at the left edge
    // instead of centered — every direct child needs to center as a block.
    alignItems: 'center',
  },

  // Both float rows share the same 20px horizontal inset as the chip row
  // beneath them (tableOuter padding 6 + tableInner paddingHorizontal 14)
  // so a villain's floating cards line up directly above their own chip.
  // zIndex alone is enough on iOS, but Android needs `elevation` too or a
  // plain View with no elevation of its own can still paint underneath a
  // sibling that comes earlier in render order (villainFloatRow renders
  // BEFORE tableOuter so the cards sit above its top edge instead of below
  // it) — both floats need to explicitly out-rank the table on both props.
  villainFloatRow: {
    position: 'absolute', top: -24, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 20,
    zIndex: 10, elevation: 10,
  },
  heroFloatRow: {
    position: 'absolute', bottom: -33, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    zIndex: 10, elevation: 10,
  },
  floatPair: { flexDirection: 'row', gap: 4 },

  // alignSelf: 'stretch' keeps this full-width despite tableInner's new
  // alignItems: 'center' — multiple villain chips should still spread
  // evenly across the table rather than clumping together in the middle.
  chipRow: { flexDirection: 'row', justifyContent: 'space-evenly', gap: 8, alignSelf: 'stretch' },

  boardRow: { flexDirection: 'row', gap: 5, justifyContent: 'center' },
  potBadge: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  potBadgeText: { fontSize: 11, fontWeight: '800', color: '#F5F0E8' },

  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center', maxWidth: 160 },
  chipText: { fontSize: 10, fontWeight: '800', color: '#F5F0E8' },

  miniCard: { backgroundColor: '#FFFFFF', borderRadius: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D4CAB8' },
  miniCardRank: { fontWeight: '800', lineHeight: 15 },
  miniCardSuit: { fontWeight: '700', lineHeight: 13 },
  miniCardEmpty: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed' },
  cardBack: { backgroundColor: '#1B3D2A', borderRadius: 5, borderWidth: 1, borderColor: '#122A1D' },

  streetsBlock: { marginTop: 10 },
  streetSection: { borderTopWidth: 0.5, borderTopColor: '#D4CAB8', paddingVertical: 8, gap: 4 },
  streetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  streetLabel: { fontSize: 10, fontWeight: '800', color: '#9A9080', letterSpacing: 0.8 },
  streetBoard: { fontSize: 10, fontWeight: '700', color: '#6B5F4F', flexShrink: 1, textAlign: 'right' },
  runoutText: { fontSize: 11, fontStyle: 'italic', color: '#9A9080' },
  noActionText: { fontSize: 11, fontStyle: 'italic', color: '#9A9080' },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  actionPlayer: { fontSize: 12, fontWeight: '700', color: '#1A1A14', flexShrink: 1 },
  pill: { borderWidth: 1.3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '700' },

  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1.5, borderTopColor: '#1B4332', paddingTop: 10, marginTop: 2,
  },
  resultText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  profitText: { fontSize: 15, fontWeight: '800' },
});
