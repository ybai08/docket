// Docket palette. Light only for the hackathon: the design has no dark mode.
// Never use red or blue for agree/disagree: teal = agreed, lavender = disagreed.
export const colors = {
  ground: '#FFFFFF',
  ink: '#000000',
  text2: '#3A3A3C', // body
  meta: '#5A5A5E', // meta lines
  tabInactive: '#6B6B70',
  hairline: '#E4E4E7',
  outline: '#D4D4D8', // inactive outlines
  track: '#A1A1AA', // 50% tick on vote sliders
  muted: '#F4F4F5',
  lavender: '#C9D0F5', // Roll Call, state bills, "disagreed"
  yellow: '#F8D08A', // Filed or Fake, Congress bills, small highlights only
  teal: '#A8DDD5', // Landslide, local items, "agreed"
  fakeInk: '#2A3A9E', // the FAKE stamp only
  vetoRed: '#C62828', // the VETOED stamp on sign-in only
  dashed: 'rgba(0, 0, 0, 0.35)',
} as const;

export type Level = 'federal' | 'state' | 'local';

export const levelColor: Record<Level, string> = {
  state: colors.lavender,
  federal: colors.yellow,
  local: colors.teal,
};
