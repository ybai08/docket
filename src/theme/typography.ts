import type { TextStyle } from 'react-native';

import { colors } from './colors';

// Newsreader is loaded in the root layout with useFonts; these are its registered names.
export const fonts = {
  serif500: 'Newsreader_500Medium',
  serif500Italic: 'Newsreader_500Medium_Italic',
  serif700: 'Newsreader_700Bold',
  serif800: 'Newsreader_800ExtraBold',
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

// Sizes come straight from design/screens/*.dc.html. Everything not serif is SF Pro.
export const type = {
  wordmark: { fontFamily: fonts.serif800, fontSize: 60, lineHeight: 64, letterSpacing: -1.5, color: colors.ink },
  brand: { fontFamily: fonts.serif800, fontSize: 22, letterSpacing: -0.4, color: colors.ink },
  display: { fontFamily: fonts.serif700, fontSize: 38, lineHeight: 42, letterSpacing: -0.6, color: colors.ink },
  title: { fontFamily: fonts.serif700, fontSize: 34, lineHeight: 38, letterSpacing: -0.4, color: colors.ink },
  billTitle: { fontFamily: fonts.serif700, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: colors.ink },
  game: { fontFamily: fonts.serif700, fontSize: 27, lineHeight: 31, color: colors.ink },
  navTitle: { fontFamily: fonts.serif700, fontSize: 20, color: colors.ink },
  bodyLg: { fontSize: 17, lineHeight: 23, color: colors.text2 },
  body: { fontSize: 15, lineHeight: 20, color: colors.ink },
  section: { fontSize: 15, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 13, lineHeight: 18, color: colors.meta },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  small: { fontSize: 12, color: colors.text2 },
  stat: { fontSize: 30, fontVariant: tabular, color: colors.ink },
  num: { fontVariant: tabular },
} as const satisfies Record<string, TextStyle>;
