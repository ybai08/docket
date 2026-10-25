import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme';

import { ChevronLeft } from './icons';

type Props = {
  step: 1 | 2 | 3;
  title: string;
  intro: string;
  children: ReactNode;
  /** Pinned to the bottom: the Continue button and its secondary link. */
  footer: ReactNode;
};

/** Onboarding page: back, three-segment progress, serif title and intro. */
export function OnboardFrame({ step, title, intro, children, footer }: Props) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {step > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={{ width: 44, height: 44, marginLeft: -12, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft />
            </Pressable>
          ) : null}
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={`Step ${step} of 3`}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.ink : colors.hairline }} />
            ))}
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.meta }}>{step} of 3</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 36, lineHeight: 40, letterSpacing: -0.4 }} accessibilityRole="header">
            {title}
          </Text>
          <Text style={{ fontSize: 16, lineHeight: 22, color: colors.text2 }}>{intro}</Text>
        </View>

        {children}
        <View style={{ flex: 1 }} />
        <View style={{ gap: 6, alignItems: 'center' }}>{footer}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ height: 40, justifyContent: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}
