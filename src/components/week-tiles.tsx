import { Text, View } from 'react-native';

import { addDays } from '@/lib/day';
import { colors } from '@/theme';

/** Sunday through Saturday of this Central-time week: ink for played days, lavender outline for today. */
export function WeekTiles({ today, played, size = 18 }: { today: string; played: Set<string>; size?: number }) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - weekday));
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <View
      style={{ flexDirection: 'row', gap: Math.round(size * 0.28) }}
      accessible
      accessibilityLabel={`This week: played ${days.filter((d) => played.has(d)).length} of ${weekday + 1} days so far`}>
      {days.map((d, i) => {
        const done = played.has(d);
        const isToday = d === today;
        const future = d > today;
        return (
          <View key={d} style={{ alignItems: 'center', gap: 4 }}>
            <Text
              style={{
                fontSize: size > 20 ? 12 : 10,
                fontWeight: '700',
                color: isToday ? colors.ink : colors.meta,
              }}>
              {letters[i]}
            </Text>
            <View
              style={{
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.22),
                backgroundColor: done ? colors.ink : isToday ? colors.lavender : colors.ground,
                borderWidth: done ? 0 : 1.5,
                borderColor: isToday ? colors.ink : future ? colors.hairline : colors.outline,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
