export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

export interface CardType {
  rank: Rank;
  suit: Suit;
}

export type GameType = 'cash' | 'tournament';
export type StackUnit = 'BB' | 'Chips' | '$';
export type AnteType = 'none' | 'ante' | 'bbAnte';
// Actor is a string: 'hero' | 'villain1..3' | 'seat_N' (unnamed seat)
export type Actor = string;
export type StreetName = 'preflop' | 'flop' | 'turn' | 'river';

export type PreflopAction = 'fold' | 'check' | 'call' | 'raise' | 'allin';
export type StreetAction  = 'fold' | 'check' | 'call' | 'bet'  | 'raise' | 'allin';
export type AnyAction     = PreflopAction | StreetAction;
export type ResultType    = 'won' | 'lost';
export type TagType       = 'review' | 'good' | 'unsure' | 'interesting';

export interface ActionEntry {
  actor: Actor;
  action: AnyAction;
  sizingBB: number;
}

export interface HandDraft {
  // ── Step 1: Game type ─────────────────────────────────────
  gameType: GameType | null;
  // ── Step 2: Blinds & stack ────────────────────────────────
  cashSB: number;
  cashBB: number;
  stakes: string;
  tournamentSB: number;
  tournamentBB: number;
  bigBlind: number;
  smallBlind: number;
  straddleEnabled: boolean;
  straddleAmount: number;
  anteType: AnteType;
  anteAmount: number;
  playerCount: number;
  effectiveStack: number;
  stackUnit: StackUnit;
  effectiveStackBB: number;
  // Has the Blinds screen's own guided sub-steps (Players → Blinds → Ante →
  // Stack) already been walked through once? Re-mounting this step (jumping
  // back to edit it, or reopening a saved hand) should show every sub-step
  // at once rather than replaying the reveal from scratch. Old hands saved
  // before this field existed are covered by the *Complete flags below —
  // reaching any later street already proves this step was finished once.
  blindsStepSeen: boolean;
  // ── Step 3: Position ──────────────────────────────────────
  heroSeat: number | null;
  // Optional nickname for Hero — empty/unset falls back to "Hero" everywhere.
  heroName: string;
  villainSeats: number[];
  villainStacksBB: Record<string, number>; // keyed 'villain1','villain2','villain3'
  // Optional nicknames (e.g. "Fish", "Reg") keyed the same way — empty/unset
  // falls back to "Villain N" everywhere the actor is displayed.
  villainNames: Record<string, string>;
  // ── Step 4: Cards ─────────────────────────────────────────
  card1: CardType | null;
  card2: CardType | null;
  // ── Step 5: Preflop ───────────────────────────────────────
  preflopActions: ActionEntry[];
  preflopComplete: boolean;
  potType: string;
  preflopPotBB: number;
  // ── Board ─────────────────────────────────────────────────
  flopCards: [CardType | null, CardType | null, CardType | null];
  turnCard: CardType | null;
  riverCard: CardType | null;
  // ── Steps 6–8: Streets ────────────────────────────────────
  flopActions: ActionEntry[];
  flopComplete: boolean;
  turnActions: ActionEntry[];
  turnComplete: boolean;
  riverActions: ActionEntry[];
  riverComplete: boolean;
  // ── Tracking ──────────────────────────────────────────────
  heroFolded: boolean;
  foldedOn: StreetName | null;
  lastStreet: StreetName;
  // ── Step 9: Result ────────────────────────────────────────
  villainMucked: boolean;       // showdown: villain mucks → hero wins
  result: ResultType | null;    // hero's own perspective — 'won' unless winner is a villain
  // Who actually won the pot at showdown — 'hero' or 'villain1'/'villain2'/'villain3'.
  // Only meaningful when the hand reached showdown with more than one live player;
  // null until the user picks (never auto-assumed).
  winner: string | null;
  potSizeBB: number;
  // Keyed 'villain1', 'villain2', 'villain3' — tuple is [card1, card2]
  villainHoleCards: Record<string, [CardType | null, CardType | null]>;
  // ── Step 10: Name & Tag ───────────────────────────────────
  handName: string;             // '' = auto-generate
  tag: TagType | null;
  notes: string;
}

export const INITIAL_DRAFT: HandDraft = {
  gameType: null,
  cashSB: 1, cashBB: 2, stakes: '',
  tournamentSB: 100, tournamentBB: 200,
  bigBlind: 2, smallBlind: 1,
  straddleEnabled: false, straddleAmount: 0,
  anteType: 'none', anteAmount: 0,
  playerCount: 6,
  effectiveStack: 100, stackUnit: 'BB', effectiveStackBB: 100,
  blindsStepSeen: false,
  heroSeat: null, heroName: '', villainSeats: [], villainStacksBB: {}, villainNames: {},
  card1: null, card2: null,
  preflopActions: [], preflopComplete: false, potType: 'SRP', preflopPotBB: 0,
  flopCards: [null, null, null], turnCard: null, riverCard: null,
  flopActions: [], flopComplete: false,
  turnActions: [], turnComplete: false,
  riverActions: [], riverComplete: false,
  heroFolded: false, foldedOn: null, lastStreet: 'preflop',
  villainMucked: false, result: null, winner: null, potSizeBB: 0,
  villainHoleCards: {},
  handName: '', tag: null, notes: '',
};

// ── Position labels ─────────────────────────────────────────────────────────
// Seat 0 = BTN.  GTO Wizard convention.
export const POSITION_LABELS: Record<number, string[]> = {
  2: ['BTN/SB', 'BB'],
  3: ['BTN',    'SB', 'BB'],
  4: ['BTN',    'SB', 'BB', 'UTG'],
  5: ['BTN',    'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN',    'SB', 'BB', 'LJ',  'HJ', 'CO'],
  7: ['BTN',    'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN',    'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN',    'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],
};

// ── Acting-order helpers ─────────────────────────────────────────────────────

// Returns seat indices in preflop acting order (UTG first, BB last).
// HU: BTN/SB(seat0) acts first.
export function getPreflopActingOrder(playerCount: number): number[] {
  if (playerCount === 2) return [0, 1];
  const early = Array.from({ length: playerCount - 3 }, (_, i) => i + 3);
  return [...early, 0, 1, 2]; // UTG…CO, BTN, SB, BB
}

// Returns seat indices in postflop acting order (SB first, BTN last).
export function getPostflopActingOrder(playerCount: number): number[] {
  if (playerCount === 2) return [1, 0];
  const nonBtn = Array.from({ length: playerCount - 1 }, (_, i) => i + 1);
  return [...nonBtn, 0];
}

// Maps seat indices to Actor strings for named players only.
export function getStreetActors(
  heroSeat: number | null,
  villainSeats: number[],
  playerCount: number,
  street: 'preflop' | 'postflop',
): Actor[] {
  const order = street === 'preflop'
    ? getPreflopActingOrder(playerCount)
    : getPostflopActingOrder(playerCount);

  const seatMap = new Map<number, Actor>();
  if (heroSeat !== null) seatMap.set(heroSeat, 'hero');
  villainSeats.forEach((seat, i) => { if (i < 3) seatMap.set(seat, `villain${i + 1}`); });

  return order.filter(s => seatMap.has(s)).map(s => seatMap.get(s)!);
}

// Full preflop acting order as actor strings (including unnamed 'seat_N').
export function getFullPreflopActorOrder(
  playerCount: number,
  heroSeat: number | null,
  villainSeats: number[],
): string[] {
  const order = getPreflopActingOrder(playerCount);
  return order.map(s => {
    if (s === heroSeat) return 'hero';
    const vi = villainSeats.indexOf(s);
    if (vi >= 0) return `villain${vi + 1}`;
    return `seat_${s}`;
  });
}

// Full postflop acting order as actor strings.
export function getFullPostflopActorOrder(
  playerCount: number,
  heroSeat: number | null,
  villainSeats: number[],
): string[] {
  const order = getPostflopActingOrder(playerCount);
  return order.map(s => {
    if (s === heroSeat) return 'hero';
    const vi = villainSeats.indexOf(s);
    if (vi >= 0) return `villain${vi + 1}`;
    return `seat_${s}`;
  });
}

// ── Forced-bet seeding ───────────────────────────────────────────────────────
// Returns initial investedBB for SB + BB (+straddle) using the full actor order.
export function buildPreflopInvestments(
  actorOrder: string[],
  smallBlindBB: number,
  straddleMultipleBB: number,
  playerCount: number,
): Record<string, number> {
  const n = actorOrder.length;
  if (n < 2) return {};
  const inv: Record<string, number> = {};
  if (playerCount === 2) {
    // HU: first = BTN/SB, second = BB
    inv[actorOrder[0]] = smallBlindBB;
    inv[actorOrder[1]] = 1;
  } else {
    // Multi-way: second-to-last = SB, last = BB
    inv[actorOrder[n - 2]] = smallBlindBB;
    inv[actorOrder[n - 1]] = 1;
    if (straddleMultipleBB > 0 && n > 2) {
      inv[actorOrder[0]] = straddleMultipleBB;
    }
  }
  return inv;
}

// ── Betting state ────────────────────────────────────────────────────────────

export interface BettingState {
  currentBetBB: number;
  minRaiseBB: number;
  potBB: number;
  foldedActors: Set<string>;
  allInActors: Set<string>;
  investedBB: Record<string, number>;
  hasActed: Set<string>;
  raiseCount: number;
  lastAggressor: string | null;
  // Sub-minimum all-in tracking
  lastRaiseInc: number;      // increment of the last full raise
  subMinAllIn: boolean;      // true when current bet came from a sub-minimum all-in
  prevCurrentBetBB: number;  // currentBetBB before the most recent aggressive action
}

export type SidePot = {
  amount: number;
  eligible: string[]; // actor IDs eligible to win this pot (non-folded, invested >= cap)
};

// Compute side pots from all-in players. Returns [] when no all-ins or all invested equally.
// Includes folded players' chips in the totals but excludes them from eligible lists.
export function computeSidePots(
  actors: string[],
  investedBB: Record<string, number>,
  foldedActors: Set<string>,
  allInActors: Set<string>,
): SidePot[] {
  if (allInActors.size === 0) return [];

  const nonFolded = actors.filter(a => !foldedActors.has(a) && (investedBB[a] ?? 0) > 0);
  if (nonFolded.length < 2) return [];

  // Unique investment levels among non-folded players, ascending
  const levels = [...new Set(nonFolded.map(a => investedBB[a] ?? 0))].sort((a, b) => a - b);
  if (levels.length <= 1) return []; // Everyone invested equally — no separate pots

  const pots: SidePot[] = [];
  let prevCap = 0;

  for (const cap of levels) {
    // How much ALL actors (including folded) contributed to this layer
    const layerTotal = actors.reduce((sum, a) => {
      const inv = investedBB[a] ?? 0;
      return sum + (Math.min(inv, cap) - Math.min(inv, prevCap));
    }, 0);

    // Only non-folded players who invested at least `cap` are eligible
    const eligible = nonFolded.filter(a => (investedBB[a] ?? 0) >= cap);

    if (layerTotal > 0) {
      pots.push({ amount: Math.round(layerTotal * 10) / 10, eligible });
    }
    prevCap = cap;
  }

  return pots;
}

// Replays the preflop action log into a running BettingState. The one
// non-obvious rule it enforces is minimum-raise reopening: a raise/all-in
// only resets `lastRaiseInc` (and clears `subMinAllIn`) when its increase
// over the current bet is at least the previous raise's increase — an
// all-in for LESS than a full raise (`subMinAllIn`) still puts more chips
// in, but doesn't reopen betting for players who already called/matched
// the prior bet, matching standard no-limit rules.
export function computePreflopState(
  actions: ActionEntry[],
  smallBlindBB: number,
  straddleMultipleBB: number,
  initialInvestments: Record<string, number>,
): BettingState {
  const initialBet = straddleMultipleBB > 0 ? straddleMultipleBB : 1;
  let currentBetBB    = initialBet;
  let lastRaiseInc    = initialBet;
  let prevCurrentBetBB = initialBet;
  let subMinAllIn     = false;
  let potBB = Object.values(initialInvestments).reduce((s, v) => s + v, 0);
  const investedBB: Record<string, number> = { ...initialInvestments };
  const foldedActors = new Set<string>();
  const allInActors  = new Set<string>();
  const hasActed     = new Set<string>();
  let raiseCount = 0;
  let lastAggressor: string | null = null;

  for (const entry of actions) {
    const a = entry.actor;
    hasActed.add(a);
    const prev = investedBB[a] ?? 0;
    switch (entry.action) {
      case 'fold':
        foldedActors.add(a);
        break;
      case 'check':
        break;
      case 'call':
        potBB += currentBetBB - prev;
        investedBB[a] = currentBetBB;
        break;
      case 'raise': {
        const inc = entry.sizingBB - currentBetBB;
        prevCurrentBetBB = currentBetBB;
        if (inc >= lastRaiseInc) { lastRaiseInc = inc; subMinAllIn = false; }
        else { subMinAllIn = true; }
        potBB += entry.sizingBB - prev;
        investedBB[a] = entry.sizingBB;
        currentBetBB = entry.sizingBB;
        lastAggressor = a;
        raiseCount++;
        break;
      }
      case 'allin': {
        const amount = entry.sizingBB;
        if (amount > currentBetBB) {
          const inc = amount - currentBetBB;
          prevCurrentBetBB = currentBetBB;
          if (inc >= lastRaiseInc) { lastRaiseInc = inc; subMinAllIn = false; }
          else { subMinAllIn = true; }
          currentBetBB = amount;
          lastAggressor = a;
          raiseCount++;
        }
        potBB += Math.max(0, amount - prev);
        investedBB[a] = amount;
        allInActors.add(a);
        break;
      }
    }
  }

  return {
    currentBetBB,
    minRaiseBB: currentBetBB + lastRaiseInc,
    potBB,
    foldedActors,
    allInActors,
    investedBB,
    hasActed,
    raiseCount,
    lastAggressor,
    lastRaiseInc,
    subMinAllIn,
    prevCurrentBetBB,
  };
}

// Postflop counterpart to computePreflopState — same replay/reopening logic
// above, just starting from an empty bet (no blinds already in) and the
// street's carried-over pot instead of blind/straddle investments.
export function computeStreetState(
  actions: ActionEntry[],
  startingPotBB: number,
): BettingState {
  let currentBetBB     = 0;
  let lastRaiseInc     = 0;
  let prevCurrentBetBB = 0;
  let subMinAllIn      = false;
  let potBB = startingPotBB;
  const foldedActors = new Set<string>();
  const allInActors  = new Set<string>();
  const investedBB: Record<string, number> = {};
  const hasActed     = new Set<string>();
  let lastAggressor: string | null = null;

  for (const entry of actions) {
    const a = entry.actor;
    hasActed.add(a);
    const prev = investedBB[a] ?? 0;
    switch (entry.action) {
      case 'fold':  foldedActors.add(a); break;
      case 'check': break;
      case 'call':
        potBB += currentBetBB - prev;
        investedBB[a] = currentBetBB;
        break;
      case 'bet':
        prevCurrentBetBB = 0;
        lastRaiseInc     = entry.sizingBB;
        subMinAllIn      = false;
        potBB += entry.sizingBB - prev;
        investedBB[a] = entry.sizingBB;
        currentBetBB = entry.sizingBB;
        lastAggressor = a;
        break;
      case 'raise': {
        const inc = entry.sizingBB - currentBetBB;
        prevCurrentBetBB = currentBetBB;
        if (inc >= lastRaiseInc) { lastRaiseInc = inc; subMinAllIn = false; }
        else { subMinAllIn = true; }
        potBB += entry.sizingBB - prev;
        investedBB[a] = entry.sizingBB;
        currentBetBB = entry.sizingBB;
        lastAggressor = a;
        break;
      }
      case 'allin': {
        const amount = entry.sizingBB;
        if (amount > currentBetBB) {
          const inc = amount - currentBetBB;
          prevCurrentBetBB = currentBetBB;
          if (inc >= lastRaiseInc) { lastRaiseInc = inc; subMinAllIn = false; }
          else { subMinAllIn = true; }
          currentBetBB = amount;
          lastAggressor = a;
        }
        potBB += Math.max(0, amount - prev);
        investedBB[a] = amount;
        allInActors.add(a);
        break;
      }
    }
  }

  return {
    currentBetBB,
    minRaiseBB: currentBetBB > 0 ? currentBetBB + lastRaiseInc : 0,
    potBB,
    foldedActors,
    allInActors,
    investedBB,
    hasActed,
    raiseCount: 0,
    lastAggressor,
    lastRaiseInc,
    subMinAllIn,
    prevCurrentBetBB,
  };
}

export function isBettingComplete(actingOrder: string[], state: BettingState): boolean {
  const live = actingOrder.filter(a => !state.foldedActors.has(a) && !state.allInActors.has(a));
  // All remaining active players are all-in or folded → no more action
  if (live.length === 0) return true;
  // Every live player must have acted AND matched the current bet.
  // (This correctly keeps action open when a single player faces an all-in they haven't responded to.)
  return live.every(a => state.hasActed.has(a) && (state.investedBB[a] ?? 0) >= state.currentBetBB);
}

export function getNextActor(actingOrder: string[], state: BettingState): string | null {
  const n = actingOrder.length;
  const isLive = (a: string) => !state.foldedActors.has(a) && !state.allInActors.has(a);
  const live = actingOrder.filter(isLive);

  // Nobody left to act
  if (live.length === 0) return null;

  // After a voluntary raise/bet, action is circular from LEFT of the aggressor.
  if (state.lastAggressor && state.currentBetBB > 0) {
    const aggrIdx = actingOrder.indexOf(state.lastAggressor);
    if (aggrIdx >= 0) {
      for (let off = 1; off < n; off++) {
        const a = actingOrder[(aggrIdx + off) % n];
        if (isLive(a) && (state.investedBB[a] ?? 0) < state.currentBetBB) return a;
      }
      return null; // everyone live has matched
    }
  }

  // No voluntary aggressor (preflop BB/straddle post, or start of postflop street).
  // First: find any live player who hasn't matched the current bet (facing an all-in).
  if (state.currentBetBB > 0) {
    const unmatched = live.find(a => (state.investedBB[a] ?? 0) < state.currentBetBB);
    if (unmatched) return unmatched;
  }
  // Then: find first live player who hasn't acted yet.
  return live.find(a => !state.hasActed.has(a)) ?? null;
}

// Returns true when all non-folded actors are all-in (no further street action needed).
export function areAllActivePlayersAllin(actingOrder: string[], state: BettingState): boolean {
  const active = actingOrder.filter(a => !state.foldedActors.has(a));
  return active.length >= 2 && active.every(a => state.allInActors.has(a));
}

// ── Hand outcome ─────────────────────────────────────────────────────────────
// Single source of truth for "is the hand over, and how" — used by both the
// Result step and the hand-history export so they never disagree. This is
// NOT the same question as "did any villain ever fold" (a villain folding on
// an earlier street in a multi-way pot doesn't end the hand while others are
// still contesting) — it only counts as fold-ended when every named villain
// has folded, leaving Hero the lone survivor. Otherwise, however the last
// street's action wrapped up (checks through, or an all-in call + runout),
// it's a genuine showdown among whoever is still live.
export interface HandOutcome {
  situation: 'hero_folded' | 'villain_folded' | 'showdown';
  // Villains still in the hand at the end (i.e. never folded) — the ones
  // relevant for a showdown: villain-card entry and "who won?" options.
  liveVillains: string[];
}

export function computeHandOutcome(draft: HandDraft): HandOutcome {
  const namedVillains = draft.villainSeats.map((_, i) => `villain${i + 1}`);

  const sbBB    = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradBB = draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const actorOrder = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const initInv     = buildPreflopInvestments(actorOrder, sbBB, stradBB, draft.playerCount);
  const pf    = computePreflopState(draft.preflopActions, sbBB, stradBB, initInv);
  const flop  = computeStreetState(draft.flopActions, pf.potBB);
  const turn  = computeStreetState(draft.turnActions, flop.potBB);
  const river = computeStreetState(draft.riverActions, turn.potBB);
  const everFolded = new Set([...pf.foldedActors, ...flop.foldedActors, ...turn.foldedActors, ...river.foldedActors]);

  const liveVillains = namedVillains.filter(v => !everFolded.has(v));

  const situation: HandOutcome['situation'] =
    draft.heroFolded || everFolded.has('hero') ? 'hero_folded'
    : liveVillains.length === 0 ? 'villain_folded'
    : 'showdown';

  return { situation, liveVillains };
}

// ── Hand math ────────────────────────────────────────────────────────────────
// Shared pot/investment book-keeping — used by the text export and the
// visual share-card so they can never disagree on a pot size or street
// order. Ante is dead money entering the pot before any preflop action, so
// it's added on top of what computePreflopState tracks (blinds/straddle +
// actions only). "BB Ante" is one full BB posted once for the table; a flat
// "Ante" is posted per seat.
export interface HandMath {
  actorOrder: string[];
  pf: BettingState;
  pfPotBB: number;
  flop: BettingState;
  turn: BettingState;
  river: BettingState;
  finalPotBB: number;
  priorFlop: Record<string, number>;
  priorTurn: Record<string, number>;
  priorRiver: Record<string, number>;
  anteTotalBB: number;
}

// Replays every street in order, feeding each one's ending pot into the
// next, so the whole hand's betting state only ever needs computing once —
// every other derived figure (pot displays, results, the share card) reads
// from this instead of re-replaying the action log itself.
export function computeHandMath(draft: HandDraft): HandMath {
  const sbBB    = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradBB = draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const actorOrder = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const initInv     = buildPreflopInvestments(actorOrder, sbBB, stradBB, draft.playerCount);
  const pf = computePreflopState(draft.preflopActions, sbBB, stradBB, initInv);

  const anteTotalBB = draft.bigBlind > 0
    ? draft.anteType === 'bbAnte' ? draft.anteAmount / draft.bigBlind
      : draft.anteType === 'ante' ? (draft.anteAmount * draft.playerCount) / draft.bigBlind
      : 0
    : 0;
  const pfPotBB = pf.potBB + anteTotalBB;

  const flop  = computeStreetState(draft.flopActions, pfPotBB);
  const turn  = computeStreetState(draft.turnActions, flop.potBB);
  const river = computeStreetState(draft.riverActions, turn.potBB);

  const combine = (...maps: Record<string, number>[]) => {
    const out: Record<string, number> = {};
    for (const m of maps) for (const k in m) out[k] = (out[k] ?? 0) + m[k];
    return out;
  };
  const priorFlop  = combine(pf.investedBB);
  const priorTurn  = combine(pf.investedBB, flop.investedBB);
  const priorRiver = combine(pf.investedBB, flop.investedBB, turn.investedBB);

  const finalPotBB = draft.riverCard ? river.potBB
    : draft.turnCard ? turn.potBB
    : draft.flopCards.some(Boolean) ? flop.potBB
    : pfPotBB;

  return { actorOrder, pf, pfPotBB, flop, turn, river, finalPotBB, priorFlop, priorTurn, priorRiver, anteTotalBB };
}

// When the hand ends in a fold, only the pot as it stood BEFORE the final
// bet/raise actually changes hands — an uncalled bet was never matched, so
// it just returns to whoever put it in rather than being "won." Shared by
// the text export and the visual share card.
// Shared scan for both computePotBeforeDecisiveFold (below) and the share
// card's net-profit figure — finds the last street with a decisive fold and
// recomputes that street up to (but not including) the uncalled bet/raise
// that ended the hand, returning both the pot at that point AND every
// actor's own investment at that point. The two numbers have to come from
// the same cut or a fold-win's profit figure double-counts the uncalled bet
// (once by excluding it from the pot, once by still counting it as "hero
// invested" even though it was never actually lost — it just returns).
function decisiveFoldState(draft: HandDraft, math: HandMath): { potBB: number; investedBB: Record<string, number> } {
  const sbBB    = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradBB = draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const initInv = buildPreflopInvestments(math.actorOrder, sbBB, stradBB, draft.playerCount);
  const streets: { acts: ActionEntry[]; recompute: (a: ActionEntry[]) => { potBB: number; investedBB: Record<string, number> }; prior: Record<string, number> }[] = [
    { acts: draft.riverActions,   recompute: (a) => computeStreetState(a, math.turn.potBB), prior: combineInvested(math.pf, math.flop, math.turn) },
    { acts: draft.turnActions,    recompute: (a) => computeStreetState(a, math.flop.potBB), prior: combineInvested(math.pf, math.flop) },
    { acts: draft.flopActions,    recompute: (a) => computeStreetState(a, math.pfPotBB),    prior: combineInvested(math.pf) },
    { acts: draft.preflopActions, recompute: (a) => { const s = computePreflopState(a, sbBB, stradBB, initInv); return { potBB: s.potBB + math.anteTotalBB, investedBB: s.investedBB }; }, prior: {} },
  ];
  for (const s of streets) {
    let foldIdx = -1;
    for (let i = s.acts.length - 1; i >= 0; i--) {
      const e = s.acts[i];
      if (e.action === 'fold' && (e.actor === 'hero' || e.actor.startsWith('villain'))) { foldIdx = i; break; }
    }
    if (foldIdx === -1) continue;
    const priorAction = s.acts[foldIdx - 1];
    const cutIdx = priorAction && (priorAction.action === 'bet' || priorAction.action === 'raise' || priorAction.action === 'allin')
      ? foldIdx - 1 : foldIdx;
    const { potBB, investedBB } = s.recompute(s.acts.slice(0, cutIdx));
    const combined: Record<string, number> = { ...s.prior };
    for (const k in investedBB) combined[k] = (combined[k] ?? 0) + investedBB[k];
    return { potBB, investedBB: combined };
  }
  const totalInvested = combineInvested(math.pf, math.flop, math.turn, math.river);
  return { potBB: math.finalPotBB, investedBB: totalInvested };
}

function combineInvested(...states: BettingState[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of states) for (const k in s.investedBB) out[k] = (out[k] ?? 0) + s.investedBB[k];
  return out;
}

export function computePotBeforeDecisiveFold(draft: HandDraft, math: HandMath): number {
  return decisiveFoldState(draft, math).potBB;
}

// Hero's net BB result when the hand ended via fold and Hero is the
// survivor — the pot Hero actually collects minus what Hero themself put in
// to get it (using the SAME cut point as the pot above, so an uncalled bet
// Hero made is neither "lost" nor double-subtracted).
export function computeFoldWinNet(draft: HandDraft, math: HandMath): number {
  const { potBB, investedBB } = decisiveFoldState(draft, math);
  return potBB - (investedBB['hero'] ?? 0);
}

// Returns true when ≤1 active (non-folded) player can still bet entering this street.
// This covers: both all-in preflop, one all-in + other called, etc.
export function shouldSkipStreetAction(
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

// A street with zero recorded actions is ambiguous — it could mean everyone
// checked (real actions, just no chips) or it could mean the street was
// never actually played because someone was already all-in. Only the
// latter should say so instead of the misleading "Checked through".
export function isAllInRunout(draft: HandDraft, street: 'flop' | 'turn' | 'river'): boolean {
  const sbBB    = draft.bigBlind > 0 ? draft.smallBlind / draft.bigBlind : 0.5;
  const stradBB = draft.straddleEnabled && draft.bigBlind > 0 ? draft.straddleAmount / draft.bigBlind : 0;
  const pfActorOrder = getFullPreflopActorOrder(draft.playerCount, draft.heroSeat, draft.villainSeats);
  const pfInitInv     = buildPreflopInvestments(pfActorOrder, sbBB, stradBB, draft.playerCount);
  const pfState       = computePreflopState(draft.preflopActions, sbBB, stradBB, pfInitInv);
  const allNamed      = getStreetActors(draft.heroSeat, draft.villainSeats, draft.playerCount, 'postflop');
  const actingOrder    = allNamed.filter(a => !pfState.foldedActors.has(a));
  return shouldSkipStreetAction(draft, street, actingOrder);
}

// ── Card / label helpers ─────────────────────────────────────────────────────

export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
// Dark red rather than a bright red — reads clearly against the cream
// background without clashing with the app's warm, muted palette.
export const SUIT_COLORS: Record<Suit, string> = {
  '♠': '#1A1A14', '♥': '#8B2020', '♦': '#8B2020', '♣': '#1A1A14',
};

export function cardLabel(c: CardType): string { return `${c.rank}${c.suit}`; }

// Every number formatter below is guaranteed to return a plain, finite,
// renderable string no matter what it's handed — undefined/null/NaN/a
// non-numeric value all fall back to 0 rather than throwing. These feed
// directly into the share card and hand-review screen, which are rendered
// off-screen for react-native-view-shot to capture; a thrown error there
// doesn't show a red-screen, it just leaves the capture promise hanging
// forever with nothing to show for it.
function safeNum(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

export function fmtSize(n: number): string {
  const v = safeNum(n);
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);
}

// K/M-compact formatter — any raw amount (pot, bet, stack, result) of 1000
// or more always renders this way, never as a bare number. Shows only as
// many decimals as the value actually needs (up to 2), so 1000 → "1K",
// 1500 → "1.5K", 1250 → "1.25K".
export function fmtCompact(n: number): string {
  const num = safeNum(n);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs < 1000) return `${sign}${fmtSize(abs)}`;
  const trim = (v: number) => String(parseFloat(v.toFixed(2)));
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`;
  const asK = abs / 1000;
  // Rounding can tip a number just under 1M (e.g. 999,999.6) up to "1000K" —
  // bump it to the next unit instead.
  if (parseFloat(trim(asK)) >= 1000) return `${sign}1M`;
  return `${sign}${trim(asK)}K`;
}

// The one place every pot/bet/stack amount in the hand-logging and review
// flow should go through — never the bare word "chips", and never a raw
// number ≥1000 without K/M notation. When the hand is tracked in BB only,
// that's all this returns ("6.5BB"). Once the user opts to also see the raw
// unit (stackUnit === 'Chips'), a cash hand gets a $ sign and a tournament
// gets a bare (compact) number, both followed by the BB equivalent in
// brackets — e.g. "$1.3K (13BB)" or "1.3K (6.5BB)".
export function fmtDualAmount(
  bb: number,
  opts: { stackUnit: StackUnit; bigBlind: number; gameType: GameType | null }
): string {
  const safeBB = safeNum(bb);
  const bbText = `${fmtSize(safeBB)}BB`;
  if (!(opts.stackUnit === 'Chips' && safeNum(opts.bigBlind) > 0)) return bbText;
  const raw = safeBB * safeNum(opts.bigBlind);
  const rawText = opts.gameType === 'cash' ? `$${fmtCompact(raw)}` : fmtCompact(raw);
  return `${rawText} (${bbText})`;
}

export function holeCardsLabel(c1: CardType | null, c2: CardType | null): string {
  if (!c1 || !c2) return '??';
  if (c1.rank === c2.rank) return `${c1.rank}${c2.rank}`;
  return `${c1.rank}${c2.rank}${c1.suit === c2.suit ? 's' : 'o'}`;
}

// Display name for a villain actor ('villain1', 'villain2', ...) — the
// nickname entered on the Position step if there is one, else "Villain N".
// Single source of truth so a rename shows up in every action display, the
// export, and the review screen without touching each one individually.
export function villainLabel(vKey: string, villainNames: Record<string, string> | undefined): string {
  const custom = villainNames?.[vKey]?.trim();
  if (custom) return custom;
  const n = parseInt(vKey.replace('villain', ''), 10);
  return `Villain ${n}`;
}

// Display name for Hero — the nickname entered on the Position step if
// there is one, else "Hero". Mirrors villainLabel above.
export function heroLabel(heroName: string | undefined): string {
  return heroName?.trim() || 'Hero';
}

export function inferPotType(raiseCount: number, hasAllIn: boolean): string {
  if (hasAllIn) return 'All-In';
  if (raiseCount === 0) return 'Limped';
  if (raiseCount === 1) return 'SRP';
  if (raiseCount === 2) return '3-Bet';
  if (raiseCount === 3) return '4-Bet';
  return `${raiseCount + 1}-Bet`;
}

// The villain to feature in the hand's title/name — whoever was still live
// (never folded) at the end, not just whichever villain happened to be
// entered first. A 3-way pot where the first villain added folds early and
// a later one goes to showdown with Hero should read "BTN vs SB", never
// "BTN vs CO" just because CO was villain #1. Falls back to whichever
// villain acted most recently when everyone's folded (Hero won by fold) —
// still more meaningful than an arbitrary first-entered seat.
function featuredVillainSeat(draft: HandDraft): number | null {
  const { liveVillains } = computeHandOutcome(draft);
  if (liveVillains.length > 0) {
    const vi = parseInt(liveVillains[0].replace('villain', ''), 10) - 1;
    return draft.villainSeats[vi] ?? null;
  }
  const streets = [draft.riverActions, draft.turnActions, draft.flopActions, draft.preflopActions];
  for (const acts of streets) {
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i].actor;
      if (a.startsWith('villain')) {
        const vi = parseInt(a.replace('villain', ''), 10) - 1;
        return draft.villainSeats[vi] ?? null;
      }
    }
  }
  return draft.villainSeats[0] ?? null;
}

export function autoHandName(draft: HandDraft): string {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? (labels[draft.heroSeat] ?? '?') : '?';
  const villSeat = featuredVillainSeat(draft);
  const villPos = villSeat !== null ? (labels[villSeat] ?? '?') : '?';
  const cards   = holeCardsLabel(draft.card1, draft.card2);
  return `${heroPos} vs ${villPos} — ${cards} — ${draft.potType || 'SRP'}`;
}
