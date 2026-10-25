import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline';
  /** lg: full-width 54pt actions. md: compact card actions. */
  size?: 'lg' | 'md';
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function PillButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  busy,
  icon,
  accessibilityLabel,
  style,
}: Props) {
  const primary = variant === 'primary';
  // Disabled primary buttons turn grey, as in the onboarding design.
  const off = primary && disabled;
  const fg = off ? colors.tabInactive : primary ? colors.ground : colors.ink;
  const lg = size === 'lg';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: lg ? 54 : 38,
          paddingHorizontal: lg ? 24 : 20,
          borderRadius: radius.pill,
          backgroundColor: off ? colors.hairline : primary ? colors.ink : colors.ground,
          borderWidth: primary ? 0 : lg ? 2 : 1.5,
          borderColor: colors.ink,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled && !primary ? 0.35 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={{ color: fg, fontSize: lg ? 18 : 15, fontWeight: lg ? '700' : '600' }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
