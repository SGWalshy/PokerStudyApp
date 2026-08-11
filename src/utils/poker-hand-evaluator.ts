import { CardType, Rank } from '@/components/log-hand/types';

// Standard Texas Hold'em best-5-of-7 hand evaluator. A hand's "score" is an
// array [category, tiebreak…] — compare lexicographically (higher is
// better). category: 8=straight flush … 0=high card, same scale poker
// players already think in, so scores never need decoding for comparison.
const RANK_VALUE: Record<Rank, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
};

// All k-length subsets of items, via classic include/exclude recursion on
// the first element. Used to try every 5-card subset of a 7-card hand
// (2 hole + 5 board) and keep whichever scores best.
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluate5(cards: CardType[]): number[] {
  const ranks = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);

  const counts = new Map<number, number>();
  ranks.forEach(r => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.entries()]
    .map(([r, c]) => ({ r, c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  const uniqueDesc = [...new Set(ranks)];
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueDesc.length === 5) {
    if (uniqueDesc[0] - uniqueDesc[4] === 4) { isStraight = true; straightHigh = uniqueDesc[0]; }
    else if (uniqueDesc.join(',') === '14,5,4,3,2') { isStraight = true; straightHigh = 5; } // wheel: A-2-3-4-5
  }

  // `groups` is rank-counts sorted by count then rank, so groups[0] is
  // always the biggest/highest group — e.g. a full house is groups[0].c===3
  // (the trips) followed by groups[1].c===2 (the pair).
  if (isStraight && isFlush) return [8, straightHigh];       // straight flush
  if (groups[0].c === 4) return [7, groups[0].r, groups[1].r]; // four of a kind
  if (groups[0].c === 3 && groups[1].c === 2) return [6, groups[0].r, groups[1].r]; // full house
  if (isFlush) return [5, ...ranks];                          // flush
  if (isStraight) return [4, straightHigh];                   // straight
  if (groups[0].c === 3) return [3, groups[0].r, ...groups.slice(1).map(g => g.r)]; // three of a kind
  if (groups[0].c === 2 && groups[1].c === 2) {                // two pair
    const pairHigh = Math.max(groups[0].r, groups[1].r);
    const pairLow = Math.min(groups[0].r, groups[1].r);
    return [2, pairHigh, pairLow, groups[2].r];
  }
  if (groups[0].c === 2) return [1, groups[0].r, ...groups.slice(1).map(g => g.r)]; // one pair
  return [0, ...ranks];                                        // high card
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? -1) - (b[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Best 5-card score reachable from up to 7 cards (2 hole + 5 board).
export function bestHandScore(cards: CardType[]): number[] {
  if (cards.length < 5) throw new Error('bestHandScore needs at least 5 cards');
  let best = evaluate5(cards.slice(0, 5));
  for (const combo of combinations(cards, 5)) {
    const score = evaluate5(combo);
    if (compareScores(score, best) > 0) best = score;
  }
  return best;
}

// Ranks each entrant's best hand and returns the key(s) of whoever has the
// single best score — more than one key means a split pot (a tie).
export function rankShowdown(entrants: { key: string; cards: CardType[] }[]): string[] {
  const scored = entrants.map(e => ({ key: e.key, score: bestHandScore(e.cards) }));
  let winners = [scored[0]];
  for (const entry of scored.slice(1)) {
    const cmp = compareScores(entry.score, winners[0].score);
    if (cmp > 0) winners = [entry];
    else if (cmp === 0) winners.push(entry);
  }
  return winners.map(w => w.key);
}
