import type { ReactNode } from 'react';
import { Platform, ScrollView, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

// iOS insets tab content above its native tab bar; the web's tab pill (src/app/(tabs)/_layout.web.tsx) floats over
// the content, so leave room for it by hand.
const BOTTOM = Platform.OS === 'web' ? 100 : 24;

/** Scrolling page for a tab: white ground, 16pt gutters, iOS insets it below the status bar and above the tab bar. */
export function TabScreen({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: BOTTOM, gap }, style]}>
      {children}
    </ScrollView>
  );
}
