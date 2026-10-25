import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadNewsreader } from '@remotion/google-fonts/Newsreader';

// Docket's palette (src/theme/colors.ts in the app). Teal = agreed / Yea, lavender = disagreed / Nay.
export const C = {
  ground: '#FFFFFF',
  ink: '#000000',
  text2: '#3A3A3C',
  meta: '#5A5A5E',
  hairline: '#E4E4E7',
  outline: '#D4D4D8',
  muted: '#F4F4F5',
  lavender: '#C9D0F5',
  yellow: '#F8D08A',
  teal: '#A8DDD5',
  fakeInk: '#2A3A9E',
} as const;

export const serif = loadNewsreader('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily;
// The app uses SF Pro for body text; Inter is the closest freely licensed match.
export const sans = loadInter('normal', { weights: ['400', '500', '600', '700', '800'], subsets: ['latin'] }).fontFamily;

export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** The facecam goes in the bottom-right 28% x 30% of the frame; nothing important may sit there. */
export const SAFE = { x: Math.round(W * 0.72), y: Math.round(H * 0.7) };
