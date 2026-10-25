import { Color } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';

// Semantic platform colors: resolve on-device and follow light/dark automatically.
export const colors = {
  label: Platform.select({ ios: Color.ios.label, android: Color.android.dynamic.onSurface, default: '#000000' })!,
  secondaryLabel: Platform.select({
    ios: Color.ios.secondaryLabel,
    android: Color.android.dynamic.onSurfaceVariant,
    default: '#3c3c43',
  })!,
  tertiaryLabel: Platform.select({
    ios: Color.ios.tertiaryLabel,
    android: Color.android.dynamic.outline,
    default: '#8e8e93',
  })!,
  separator: Platform.select({
    ios: Color.ios.separator,
    android: Color.android.dynamic.outlineVariant,
    default: '#c6c6c8',
  })!,
  groupedBackground: Platform.select({
    ios: Color.ios.systemGroupedBackground,
    android: Color.android.dynamic.surface,
    default: '#f2f2f7',
  })!,
  groupedSurface: Platform.select({
    ios: Color.ios.secondarySystemGroupedBackground,
    android: Color.android.dynamic.surfaceContainer,
    default: '#ffffff',
  })!,
  // Bill outcomes reuse the platform's own red/green so they match system UI.
  vetoed: Platform.select({ ios: Color.ios.systemRed, android: Color.android.dynamic.error, default: '#ff3b30' })!,
  passed: Platform.select({ ios: Color.ios.systemGreen, android: Color.android.dynamic.tertiary, default: '#34c759' })!,
};

// Brand "docket ink": the one color the platform doesn't provide.
const brandPalette = {
  light: { ink: '#2A3A9E', onInk: '#FFFFFF' },
  dark: { ink: '#A7B2FF', onInk: '#14194A' },
} as const;

export function useBrandColors() {
  const scheme = useColorScheme();
  return brandPalette[scheme === 'dark' ? 'dark' : 'light'];
}
