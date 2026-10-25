import type { TextStyle } from 'react-native';

import { colors } from './colors';

// Mirrors Apple's text styles so sizes feel native; color defaults are semantic.
export const type = {
  wordmark: { fontSize: 52, fontWeight: '900', letterSpacing: -2, color: colors.label },
  title: { fontSize: 22, fontWeight: '700', color: colors.label },
  headline: { fontSize: 17, fontWeight: '600', color: colors.label },
  body: { fontSize: 17, fontWeight: '400', color: colors.label },
  callout: { fontSize: 16, fontWeight: '400', color: colors.secondaryLabel },
  subhead: { fontSize: 15, fontWeight: '400', color: colors.secondaryLabel },
  footnote: { fontSize: 13, fontWeight: '400', color: colors.secondaryLabel },
  stat: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'], color: colors.label },
  billNumber: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], color: colors.secondaryLabel },
} as const satisfies Record<string, TextStyle>;
