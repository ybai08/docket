import { Text, type TextProps } from 'react-native';

import { type } from '@/theme';

export function ThemedText({ variant = 'body', style, ...props }: TextProps & { variant?: keyof typeof type }) {
  return <Text style={[type[variant], style]} {...props} />;
}
