import type { ReactNode } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

/** Scrolling page for a tab: white ground, 16pt gutters, iOS insets it below the status bar and above the tab bar. */
export function TabScreen({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 24, gap }, style]}>
      {children}
    </ScrollView>
  );
}
