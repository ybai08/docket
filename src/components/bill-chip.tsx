import { Text, View } from 'react-native';

import { levelColor, radius, type Level } from '@/theme';

export function BillChip({ number, level, size = 'md' }: { number: string; level: Level; size?: 'md' | 'sm' }) {
  const md = size === 'md';
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: md ? 10 : 8,
        paddingVertical: md ? 3 : 2,
        borderRadius: radius.pill,
        backgroundColor: levelColor[level],
      }}>
      <Text style={{ fontSize: md ? 13 : 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{number}</Text>
    </View>
  );
}
