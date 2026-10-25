import type { Level } from '@/theme';

export const TOPICS = [
  'Public schools',
  'Colleges and tuition',
  'Housing and property tax',
  'Criminal justice',
  'Guns',
  'Immigration and border',
  'Energy and the grid',
  'Water and environment',
  'Health care',
  'Elections and voting',
  'Tech and privacy',
  'Taxes and budget',
] as const;

export type Topic = (typeof TOPICS)[number];

export type ChamberVote = {
  /** e.g. "Texas House", "U.S. Senate", "City Council" */
  chamber: string;
  yeas?: number;
  nays?: number;
  /** Passed by unanimous consent, so there is no recorded count. */
  consent?: boolean;
};

export type Bill = {
  id: string;
  level: Level;
  jurisdiction: string;
  number: string;
  /** Shown top right of the bill card, e.g. "Texas House, 2025". */
  origin: string;
  /** Plain-English title for the voting card. */
  title: string;
  /** Short label for results rows, e.g. "Hemp THC ban". */
  shortTitle: string;
  summary: string;
  topic: Topic;
  /** In the order the chambers voted. */
  chamberVotes: ChamberVote[];
  /** Whether the legislative body passed it. A veto doesn't change this. */
  passed: boolean;
  /** The outcome line, e.g. "Signed into law", "Vetoed by the governor". */
  outcome: string;
  sourceUrl: string;
};

export type Vote = 'yea' | 'nay';

export type Caption = {
  id: string;
  /** "Relating to ..." exactly as filed, or our invented one. */
  text: string;
  /** e.g. "Texas House, 2025" */
  origin: string;
  real: boolean;
  /** Bill number for real captions. Never shown for fakes. */
  number?: string;
  /** Shown after answering. */
  explanation: string;
  sourceUrl?: string;
};

export type LandslideItem = {
  billId: string;
  number: string;
  title: string;
  yeas: number;
  nays: number;
  sourceUrl: string;
};

export type DailySet = {
  /** YYYY-MM-DD in Central time. */
  day: string;
  rollCall: Bill[];
  filedOrFake: Caption[];
  landslide: {
    prompt: string;
    /** Shuffled starting order; the answer is sorted by margin. */
    items: LandslideItem[];
  };
};

export type GameId = 'roll-call' | 'filed-or-fake' | 'landslide';
