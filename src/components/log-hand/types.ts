export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

export interface CardType {
  rank: Rank;
  suit: Suit;
}

export type GameType = 'cash' | 'tournament';
export type StackUnit = 'BB' | 'Chips' | '$';
export type PreflopAction = 'fold' | 'limp' | 'call' | 'raise' | '3bet' | '4bet' | 'allin';
export type StreetAction = 'fold' | 'check' | 'bet' | 'call' | 'raise' | 'allin';
export type ResultType = 'won' | 'lost' | 'folded';
export type TagType = 'review' | 'good' | 'unsure' | 'interesting';

export interface ActionEntry {
  action: string;
  sizingBB: number;
}

export interface HandDraft {
  // Step 1
  gameType: GameType | null;
  stakes: string;
  bigBlind: number;
  // Step 2
  playerCount: number;
  effectiveStack: number;
  stackUnit: StackUnit;
  // Step 3
  heroSeat: number | null;
  villainSeats: number[];
  // Step 4
  card1: CardType | null;
  card2: CardType | null;
  // Step 5 preflop
  preflopAction: PreflopAction | null;
  preflopSizingBB: number;
  potType: string;
  preflopPotBB: number;
  // Steps 6-8 streets
  flopCards: [CardType | null, CardType | null, CardType | null];
  flopAction: StreetAction | null;
  flopSizingBB: number;
  turnCard: CardType | null;
  turnAction: StreetAction | null;
  turnSizingBB: number;
  riverCard: CardType | null;
  riverAction: StreetAction | null;
  riverSizingBB: number;
  // tracking
  foldedOn: 'preflop' | 'flop' | 'turn' | 'river' | null;
  lastStreet: 'preflop' | 'flop' | 'turn' | 'river';
  // Step 9
  result: ResultType | null;
  potSizeBB: number;
  wasAllIn: boolean;
  showdown: boolean;
  villainCard1: CardType | null;
  villainCard2: CardType | null;
  // Step 10
  tag: TagType | null;
  notes: string;
}

export const INITIAL_DRAFT: HandDraft = {
  gameType: null,
  stakes: '',
  bigBlind: 2,
  playerCount: 6,
  effectiveStack: 100,
  stackUnit: 'BB',
  heroSeat: null,
  villainSeats: [],
  card1: null,
  card2: null,
  preflopAction: null,
  preflopSizingBB: 3,
  potType: 'SRP',
  preflopPotBB: 0,
  flopCards: [null, null, null],
  flopAction: null,
  flopSizingBB: 0,
  turnCard: null,
  turnAction: null,
  turnSizingBB: 0,
  riverCard: null,
  riverAction: null,
  riverSizingBB: 0,
  foldedOn: null,
  lastStreet: 'preflop',
  result: null,
  potSizeBB: 0,
  wasAllIn: false,
  showdown: false,
  villainCard1: null,
  villainCard2: null,
  tag: null,
  notes: '',
};

export const POSITION_LABELS: Record<number, string[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
};

export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const SUIT_COLORS: Record<Suit, string> = {
  '♠': '#1A1A14',
  '♥': '#C04040',
  '♦': '#C04040',
  '♣': '#1A1A14',
};

export function cardLabel(card: CardType): string {
  return `${card.rank}${card.suit}`;
}

export function holeCardsLabel(c1: CardType | null, c2: CardType | null): string {
  if (!c1 || !c2) return '??';
  const suited = c1.suit === c2.suit;
  if (c1.rank === c2.rank) return `${c1.rank}${c2.rank}`;
  return `${c1.rank}${c2.rank}${suited ? 's' : 'o'}`;
}

export function inferPotType(action: PreflopAction | null, prevType: string): string {
  if (action === 'raise') return 'SRP';
  if (action === '3bet') return '3-Bet';
  if (action === '4bet') return '4-Bet';
  if (action === 'allin') return 'All-In';
  return prevType;
}

export function inferLastStreet(draft: HandDraft): string {
  if (draft.riverAction) return 'River';
  if (draft.turnAction) return 'Turn';
  if (draft.flopAction) return 'Flop';
  return 'Preflop';
}
