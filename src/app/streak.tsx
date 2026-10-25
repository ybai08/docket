import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { FlameIcon } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { WeekTiles } from '@/components/week-tiles';
import { useMe } from '@/lib/me-context';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

/** A short sheet from the Today streak badge: your streak, your best, and this week. */
export default function StreakSheet() {
  const { day, stats, status } = useToday();
  const { stats: server } = useMe();
  const streak = stats.currentStreak;
  const best = Math.max(stats.maxStreak, streak);
  // Today counts as played as soon as any ballot is in, even before the server stats refresh.
  const playedToday = Object.values(status).some((s) => s.state === 'done');
  const played = new Set(server?.weekPlayed ?? []);
  if (playedToday) played.add(day);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, padding: 20, paddingTop: 28, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 2,
            backgroundColor: colors.yellow,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <FlameIcon size={26} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.serif800, fontSize: 30, lineHeight: 34 }} accessibilityRole="header">
            {streak}-day streak
          </Text>
          <Text style={{ fontSize: 14, color: colors.text2 }}>Best: {best} {best === 1 ? 'day' : 'days'}</Text>
        </View>
      </View>

      <View style={{ alignItems: 'center' }}>
        <WeekTiles today={day} played={played} size={30} />
      </View>

      <Text style={[type.body, { color: colors.text2, lineHeight: 21, textAlign: 'center' }]}>
        {playedToday
          ? "You've played today. Come back tomorrow to keep it going."
          : streak > 0
            ? 'Play any ballot today to keep your streak alive.'
            : 'Play any ballot today to start a streak.'}
      </Text>

      <PillButton label="Got it" style={{ alignSelf: 'stretch', height: 50 }} onPress={() => router.back()} />
    </View>
  );
}
