import { HandDraft } from '../log-hand/types';

export type ReviewStatus   = 'unreviewed' | 'in_progress' | 'reviewed';

// A user-authored flag — no premade options anymore, just whatever text and
// color the user picked when they tapped "+ Add Flag".
export interface Flag {
  label: string;
  color: string;
}

export interface ActionNote {
  note: string;
  flags: Flag[];
}

export interface StreetNote {
  note: string;
  flags: Flag[];
}

export interface HandReview {
  conceptTags: string[];
  overallNotes: string;
  // "preflop_0", "flop_2", etc. — index into the full actions array
  actionNotes: Record<string, ActionNote>;
  // "preflop", "flop", "turn", "river"
  streetNotes: Record<string, StreetNote>;
  markedReviewed: boolean;
  partiallyReviewed: boolean;             // explicit "Partially Reviewed" status button
  reviewedAt?: string;                    // ISO date string when marked reviewed
}

export const INITIAL_REVIEW: HandReview = {
  conceptTags: [],
  overallNotes: '',
  actionNotes: {},
  streetNotes: {},
  markedReviewed: false,
  partiallyReviewed: false,
};

export interface HandRecord {
  id: string;
  draft: HandDraft | null;
  review: HandReview;
  status: ReviewStatus;
  createdAt: string;
  displayPositions: string;
  displayHoleCards: string;
  displayPotType: string;
  displayStreet: string;
  displayPotSize: number;
  displayDate: string;
  flagged: boolean;
}

// ── Flag colors ────────────────────────────────────────────────────────────────
// Palette offered in the "+ Add Flag" color picker.
export const FLAG_COLOR_PALETTE = [
  '#5B6CF4', '#D4683A', '#C04040', '#7B3FAE', '#2E7D52', '#C8940A', '#1B4332', '#A040A0',
];

// Old preset flag keys → readable label + color, so hands saved before custom
// flags existed still render sensibly instead of showing a raw slug.
const LEGACY_FLAG_PRESETS: Record<string, Flag> = {
  'hero-range':    { label: 'Study hero range',      color: '#5B6CF4' },
  'bet-sizing':    { label: 'Study bet sizing',      color: '#D4683A' },
  'villain-range': { label: 'Study villain range',   color: '#C04040' },
  'solver':        { label: 'Run in solver',         color: '#7B3FAE' },
  'coach':         { label: 'Ask coach',              color: '#1B4332' },
  'common':        { label: 'Common spot',            color: '#2E7D52' },
  'emotional':     { label: 'Emotional decision',     color: '#C8940A' },
  'stack-off':     { label: 'Stack off spot',         color: '#B83232' },
  'bluff':         { label: 'Bluff spot',             color: '#A040A0' },
  'value-misplay': { label: 'Value hand misplayed',   color: '#C86A00' },
};

function migrateFlags(flags: any): Flag[] {
  if (!Array.isArray(flags)) return [];
  return flags.map((f: any): Flag => {
    if (f && typeof f === 'object' && typeof f.label === 'string' && typeof f.color === 'string') return f;
    const key = String(f);
    return LEGACY_FLAG_PRESETS[key] ?? { label: key, color: FLAG_COLOR_PALETTE[0] };
  });
}

// ── Migration for records loaded from AsyncStorage that were saved with old schema ──
export function migrateRecord(raw: any): HandRecord {
  const r = { ...raw };
  if (!r.review) r.review = { ...INITIAL_REVIEW };
  const rv = { ...r.review };

  rv.conceptTags = rv.conceptTags ?? [];
  rv.overallNotes = rv.overallNotes ?? '';
  rv.actionNotes = Object.fromEntries(
    Object.entries(rv.actionNotes ?? {}).map(([k, v]: [string, any]) => [k, { note: v?.note ?? '', flags: migrateFlags(v?.flags) }])
  );
  rv.streetNotes = Object.fromEntries(
    Object.entries(rv.streetNotes ?? {}).map(([k, v]: [string, any]) => [k, { note: v?.note ?? '', flags: migrateFlags(v?.flags) }])
  );
  rv.markedReviewed = rv.markedReviewed ?? false;
  rv.partiallyReviewed = rv.partiallyReviewed ?? false;
  rv.reviewedAt = rv.reviewedAt;

  r.review = rv;
  return r as HandRecord;
}

export function computeStatus(review: HandReview): ReviewStatus {
  if (review.markedReviewed) return 'reviewed';
  if (review.partiallyReviewed) return 'in_progress';
  const hasContent =
    review.conceptTags.length > 0 ||
    review.overallNotes.trim().length > 0 ||
    Object.values(review.actionNotes).some(n => n.note.trim().length > 0 || n.flags.length > 0) ||
    Object.values(review.streetNotes).some(n => n.note.trim().length > 0 || n.flags.length > 0);
  return hasContent ? 'in_progress' : 'unreviewed';
}
