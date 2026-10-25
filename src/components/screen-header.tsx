import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, type } from '@/theme';

import { ChevronLeft, HelpIcon } from './icons';

type Props = {
  title: string;
  onBack?: () => void;
  /** Shows the "How to play" button. */
  onHelp?: () => void;
  right?: ReactNode;
};

/** Game screen header: back, serif title, help. Hairline underneath, edge to edge. */
export function ScreenHeader({ title, onBack, onHelp, right }: Props) {
  return (
    <View
      style={{
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Today"
        hitSlop={4}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <ChevronLeft />
      </Pressable>
      <Text style={type.navTitle} accessibilityRole="header">
        {title}
      </Text>
      {right ??
        (onHelp ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="How to play"
            onPress={onHelp}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <HelpIcon />
          </Pressable>
        ) : (
          <View style={{ width: 44, height: 44 }} />
        ))}
    </View>
  );
}
