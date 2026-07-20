import AsyncStorage from '@react-native-async-storage/async-storage';

import { HandRecord, INITIAL_REVIEW, migrateRecord } from '@/components/hand-review/types';
import { HandDraft, POSITION_LABELS, holeCardsLabel } from '@/components/log-hand/types';

const STORAGE_KEY = 'hands_v1';

export async function loadHandRecords(): Promise<HandRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Apply schema migration to every record so old saved data stays compatible
    return parsed.map(migrateRecord);
  } catch {
    return [];
  }
}

export async function saveHandRecords(records: HandRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Silent — data available in-session even if write fails
  }
}

function inferLastStreet(draft: HandDraft): string {
  if (draft.riverActions.length > 0) return 'River';
  if (draft.turnActions.length > 0)  return 'Turn';
  if (draft.flopActions.length > 0)  return 'Flop';
  return 'Preflop';
}

export function draftToRecord(draft: HandDraft, id: string, createdAt: string): HandRecord {
  const labels  = POSITION_LABELS[draft.playerCount] ?? [];
  const heroPos = draft.heroSeat !== null ? (labels[draft.heroSeat] ?? 'Hero') : 'Hero';
  const villPos = draft.villainSeats.length > 0
    ? draft.villainSeats.map((s, i) => `V${i + 1}(${labels[s] ?? '?'})`).join(', ')
    : '?';

  return {
    id,
    draft,
    review:           { ...INITIAL_REVIEW },
    status:           'unreviewed',
    createdAt,
    displayPositions: `${heroPos} vs ${villPos}`,
    displayHoleCards: holeCardsLabel(draft.card1, draft.card2),
    displayPotType:   draft.potType || 'SRP',
    displayStreet:    inferLastStreet(draft),
    displayPotSize:   Math.round(draft.preflopPotBB),
    displayDate:      createdAt,
    flagged:          draft.tag === 'review',
  };
}
