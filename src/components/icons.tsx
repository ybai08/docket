import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

// Icon paths copied from design/screens/*.dc.html so they match the mockups.

type IconProps = { size?: number; color?: string };

export function FlameIcon({ size = 15, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 2.5c1.2 3.4 4.8 5.2 4.8 9.8a4.8 4.8 0 0 1-9.6 0c0-1.9.8-3.2 1.8-4.2.4 1.8 1.2 2.4 1.8 2.4 0-3 0-5.8 1.2-8z" />
    </Svg>
  );
}

export function ChevronRight({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function ChevronLeft({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function HelpIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Circle cx="12" cy="12" r="9" />
      <Path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
      <Circle cx="12" cy="17" r="0.6" fill={color} />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  );
}

export function GoogleG({ size = 20 }: { size?: number }) {
  // Google's brand colors for its mark; not theme colors.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" fill="#4285F4" />
      <Path d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" fill="#34A853" />
      <Path d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7H2.1a11 11 0 0 0 0 9.9l3.7-2.7z" fill="#FBBC05" />
      <Path d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" fill="#EA4335" />
    </Svg>
  );
}

export function RollCallGlyph({ size = 52 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 58 58">
      <Rect x="9" y="6" width="40" height="46" rx="5" fill={colors.ground} stroke={colors.ink} strokeWidth={3} />
      <Path d="M19 29l7 7 14-15" fill="none" stroke={colors.ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function FiledOrFakeGlyph({ size = 52 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 58 58">
      <Rect x="8" y="34" width="42" height="12" rx="3" fill={colors.ground} stroke={colors.ink} strokeWidth={3} />
      <Path d="M22 34v-8a7 7 0 1 1 14 0v8" fill={colors.ground} stroke={colors.ink} strokeWidth={3} />
      <Path d="M10 52h38" stroke={colors.ink} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export function LandslideGlyph({ size = 52 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 58 58">
      <Rect x="8" y="30" width="11" height="20" rx="2" fill={colors.ground} stroke={colors.ink} strokeWidth={3} />
      <Rect x="24" y="10" width="11" height="40" rx="2" fill={colors.ink} stroke={colors.ink} strokeWidth={3} />
      <Rect x="40" y="22" width="11" height="28" rx="2" fill={colors.ground} stroke={colors.ink} strokeWidth={3} />
    </Svg>
  );
}
