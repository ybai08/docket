import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { FlameIcon } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { WeekTiles } from '@/components/week-tiles';
import { useMe } from '@/lib/me-context';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

const goBack = () => router.back();

/**
 * From the Today streak badge: your streak, your best and this week. A full-width bottom sheet sized to
 * its content (native sheets at part height float with side margins), dismissed by tap, drag or Got it.
 */
export default function StreakSheet() {
  const { day, stats, status } = useToday();
  const { stats: server } = useMe();
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const reduced = useReducedMotion();

  const streak = stats.currentStreak;
  const best = Math.max(stats.maxStreak, streak);
  // Today counts as played as soon as any ballot is in, even before the server stats refresh.
  const playedToday = Object.values(status).some((s) => s.state === 'done');
  const played = new Set(server?.weekPlayed ?? []);
  if (playedToday) played.add(day);

  // y is how far the sheet sits below its resting place; it starts off screen and springs up.
  const y = useSharedValue(screen);
  const sheetHeight = useSharedValue(screen);

  useEffect(() => {
    y.set(reduced ? 0 : withSpring(0, { duration: 380, dampingRatio: 0.9 }));
  }, [y, reduced]);

  function close() {
    y.set(withTiming(sheetHeight.get(), { duration: reduced ? 0 : 200 }, (done) => done && scheduleOnRN(goBack)));
  }

  const pan = usePanGesture({
    activeOffsetY: [-10, 10],
    onUpdate: (e) => {
      y.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      if (e.translationY > 90 || e.velocityY > 900) {
        y.set(withTiming(sheetHeight.get(), { duration: 180 }, (done) => done && scheduleOnRN(goBack)));
      } else {
        y.set(withSpring(0, { duration: 300, dampingRatio: 1, velocity: e.velocityY }));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, sheetHeight.get()], [1, 0], 'clamp'),
  }));

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.32)' }, backdropStyle]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={(e) => sheetHeight.set(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
          style={[
            {
              backgroundColor: colors.ground,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderCurve: 'continuous',
              paddingHorizontal: 24,
              paddingTop: 10,
              paddingBottom: insets.bottom + 16,
            },
            sheetStyle,
          ]}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.outline, marginBottom: 24 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                borderWidth: 2,
                backgroundColor: colors.yellow,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <FlameIcon size={28} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.serif800, fontSize: 32, lineHeight: 36 }} accessibilityRole="header">
                {streak}-day streak
              </Text>
              <Text style={{ fontSize: 15, color: colors.text2 }}>
                Best: {best} {best === 1 ? 'day' : 'days'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 28, paddingVertical: 18, borderRadius: 16, backgroundColor: colors.muted, alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>This week</Text>
            <WeekTiles today={day} played={played} size={32} />
          </View>

          <Text style={[type.body, { marginTop: 22, color: colors.text2, lineHeight: 21, textAlign: 'center' }]}>
            {playedToday
              ? "You've played today. Come back tomorrow to keep it going."
              : streak > 0
                ? 'Play any ballot today to keep your streak alive.'
                : 'Play any ballot today to start a streak.'}
          </Text>

          <PillButton label="Got it" style={{ alignSelf: 'stretch', height: 52, marginTop: 24 }} onPress={close} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
