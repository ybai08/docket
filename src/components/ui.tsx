import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radius } from '@/lib/theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primary : styles.ghost,
        pressed && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.accentText} />
      ) : (
        <Text style={[styles.buttonText, variant === 'ghost' && { color: colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return <Text style={[styles.logo, { fontSize: size }]}>Docket</Text>;
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  logo: { color: colors.accent, fontWeight: '800', letterSpacing: -0.5 },
});
