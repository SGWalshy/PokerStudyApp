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
  // ── Step 3: Position ──────────────────────────────────────
  heroSeat: number | null;
  villainSeats: number[];
  villainStacksBB: Record<string, number>; // keyed 'villain1','villain2','villain3'
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
  result: ResultType | null;    // only set in showdown where we can't auto-determine
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
  heroSeat: null, villainSeats: [], villainStacksBB: {},
  card1: null, card2: null,
  preflopActions: [], preflopComplete: false, potType: 'SRP', preflopPotBB: 0,
  flopCards: [null, null, null], turnCard: null, riverCard: null,
  flopActions: [], flopComplete: false,
  turnActions: [], turnComplete: false,
  riverActions: [], riverComplete: false,
  heroFolded: false, foldedOn: null, lastStreet: 'preflop',
  villainMucked: false, result: null, potSizeBB: 0,
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

// ── Card / label helpers ─────────────────────────────────────────────────────

export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
// Dark red rather than a bright red — reads clearly against the cream
// background without clashing with the app's warm, muted palette.
export const SUIT_COLORS: Record<Suit, string> = {
  '♠': '#1A1A14', '♥': '#8B2020', '♦': '#8B2020', '♣': '#1A1A14',
};

export function cardLabel(c: CardType): string { return `${c.rank}${c.suit}`; }

export function holeCardsLabel(c1: CardType | null, c2: CardType | null): string {
  if (!c1 || !c2) return '??';
  if (c1.rank === c2.rank) return `${c1.rank}${c2.rank}`;
  return `${c1.rank}${c2.rank}${c1.suit === c2.suit ? 's' : 'o'}`;
}

export function inferPotType(raiseCount: number, hasAllIn: boolean): string {
  if (hasAllIn) return 'All-In';
  if (raiseCount === 0) return 'Limped';
  if (raiseCount === 1) return 'SRP';
  if (raiseCount === 2) return '3-Bet';
  if (raiseCount === 3) return '4-Bet';
  return `${raiseCount + 1}-Bet`;
}

export function autoHandName(draft: HandDraft): string {
  const labels = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? (labels[draft.heroSeat] ?? '?') : '?';
  const villPos = draft.villainSeats.length > 0 ? (labels[draft.villainSeats[0]] ?? '?') : '?';
  const cards   = holeCardsLabel(draft.card1, draft.card2);
  return `${heroPos} vs ${villPos} — ${cards} — ${draft.potType || 'SRP'}`;
}
