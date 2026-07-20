import { HandDraft } from '../log-hand/types';

export type ReviewStatus   = 'unreviewed' | 'in_progress' | 'reviewed';
export type DecisionRating = 'good' | 'mistake' | 'unsure';
export type MistakeCategory =
  | 'over-folded'        | 'bad-sizing'        | 'wrong-bluff'
  | 'wrong-call'         | 'missed-value'      | 'wrong-raise'
  | 'timing-tell'        | 'emotional-decision' | 'other';

export interface ActionNote {
  note: string;
  promptUsed?: string;
  flags: string[];
}

export interface StreetNote {
  note: string;
  flags: string[];
}

export interface HandReview {
  decisionRating?: DecisionRating;
  mistakeCategories: MistakeCategory[];   // multi-select
  conceptTags: string[];
  solverOutput: string;                   // paste field for raw solver output
  solverRecommends: string;               // structured: what solver says to do
  evDifference: string;                   // structured: EV gap
  overallNotes: string;
  // "preflop_0", "flop_2", etc. — index into the full actions array
  actionNotes: Record<string, ActionNote>;
  // "preflop", "flop", "turn", "river"
  streetNotes: Record<string, StreetNote>;
  coachFeedback: string;
  requestCoachReview: boolean;
  markedReviewed: boolean;
  reviewedAt?: string;                    // ISO date string when marked reviewed
}

export const INITIAL_REVIEW: HandReview = {
  mistakeCategories: [],
  conceptTags: [],
  solverOutput: '',
  solverRecommends: '',
  evDifference: '',
  overallNotes: '',
  actionNotes: {},
  streetNotes: {},
  coachFeedback: '',
  requestCoachReview: false,
  markedReviewed: false,
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

// ── Migration for records loaded from AsyncStorage that were saved with old schema ──
export function migrateRecord(raw: any): HandRecord {
  const r = { ...raw };
  if (!r.review) r.review = { ...INITIAL_REVIEW };
  const rv = { ...r.review };

  // gtoOutput → solverOutput
  if ('gtoOutput' in rv && !('solverOutput' in rv)) {
    rv.solverOutput = rv.gtoOutput ?? '';
    delete rv.gtoOutput;
  }
  // mistakeCategory (single) → mistakeCategories (array)
  if ('mistakeCategory' in rv && !('mistakeCategories' in rv)) {
    rv.mistakeCategories = rv.mistakeCategory ? [rv.mistakeCategory] : [];
    delete rv.mistakeCategory;
  }

  // Fill in any missing new fields
  rv.solverOutput       = rv.solverOutput       ?? '';
  rv.solverRecommends   = rv.solverRecommends   ?? '';
  rv.evDifference       = rv.evDifference       ?? '';
  rv.mistakeCategories  = rv.mistakeCategories  ?? [];
  rv.requestCoachReview = rv.requestCoachReview ?? false;
  rv.reviewedAt         = rv.reviewedAt;

  r.review = rv;
  return r as HandRecord;
}

export function computeStatus(review: HandReview): ReviewStatus {
  if (review.markedReviewed) return 'reviewed';
  const hasContent =
    !!review.decisionRating ||
    review.mistakeCategories.length > 0 ||
    review.conceptTags.length > 0 ||
    review.solverOutput.trim().length > 0 ||
    review.solverRecommends.trim().length > 0 ||
    review.evDifference.trim().length > 0 ||
    review.overallNotes.trim().length > 0 ||
    review.coachFeedback.trim().length > 0 ||
    review.requestCoachReview ||
    Object.values(review.actionNotes).some(n => n.note.trim().length > 0 || n.flags.length > 0) ||
    Object.values(review.streetNotes).some(n => n.note.trim().length > 0 || n.flags.length > 0);
  return hasContent ? 'in_progress' : 'unreviewed';
}

// ── Prompts ──────────────────────────────────────────────────────────────────

export const ACTION_PROMPTS: Record<string, string[]> = {
  bet:   ['Why did you choose this size?', 'What hands are you targeting?', 'What does your range look like here?', 'What are you trying to achieve?'],
  raise: ['Why did you choose this size?', 'What hands are you targeting?', 'What does your range look like here?', 'What are you trying to achieve?'],
  allin: ['Why did you choose this size?', 'What hands are you targeting?', 'What does your range look like here?', 'What are you trying to achieve?'],
  call:  ['What are your pot odds?', "What is villain's range?", 'Why not raise or fold?', 'What is your plan for later streets?'],
  check: ['Why are you checking instead of betting?', 'What do you want villain to do?', 'Are you protecting your checking range?'],
  fold:  ['Could you have continued here?', 'What hands beat you?', 'Was this a close spot?'],
};

export const STREET_PROMPTS = [
  'What is your overall strategy this street?',
  'How should your range play this board?',
  "What is villain's range here?",
  'What are the key decision points this street?',
];

// ── Study flags ───────────────────────────────────────────────────────────────

export interface StudyFlagDef {
  key: string;
  label: string;
  color: string;
}

export const STUDY_FLAGS: StudyFlagDef[] = [
  { key: 'hero-range',    label: 'Study hero range',      color: '#5B6CF4' },
  { key: 'bet-sizing',    label: 'Study bet sizing',      color: '#D4683A' },
  { key: 'villain-range', label: 'Study villain range',   color: '#C04040' },
  { key: 'solver',        label: 'Run in solver',         color: '#7B3FAE' },
  { key: 'coach',         label: 'Ask coach',             color: '#1B4332' },
  { key: 'common',        label: 'Common spot',           color: '#2E7D52' },
  { key: 'emotional',     label: 'Emotional decision',    color: '#C8940A' },
  { key: 'stack-off',     label: 'Stack off spot',        color: '#B83232' },
  { key: 'bluff',         label: 'Bluff spot',            color: '#A040A0' },
  { key: 'value-misplay', label: 'Value hand misplayed',  color: '#C86A00' },
];

// ── Concept tags ──────────────────────────────────────────────────────────────

export const CONCEPT_TAG_PRESETS = [
  '3bet pot', 'Single raised', '4bet pot', 'Limped pot',
  'Bluff catch', 'River spot', 'Turn spot', 'Continuation bet',
  'Multiway', 'Heads up', 'In position', 'Out of position',
  'Nut advantage', 'Range bet', 'Polarised', 'Merged',
];

// ── Mistake categories (multi-select) ─────────────────────────────────────────

export const MISTAKE_CATEGORIES: { key: MistakeCategory; label: string }[] = [
  { key: 'over-folded',        label: 'Over-folded'        },
  { key: 'bad-sizing',         label: 'Bad sizing'         },
  { key: 'wrong-bluff',        label: 'Wrong bluff'        },
  { key: 'wrong-call',         label: 'Wrong call'         },
  { key: 'missed-value',       label: 'Missed value'       },
  { key: 'wrong-raise',        label: 'Wrong raise'        },
  { key: 'timing-tell',        label: 'Timing tell'        },
  { key: 'emotional-decision', label: 'Emotional decision' },
  { key: 'other',              label: 'Other'              },
];
