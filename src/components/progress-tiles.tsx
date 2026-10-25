import { View } from 'react-native';

import { colors } from '@/theme';

export type TileState = 'done' | 'current' | 'todo';

const SIZES = {
  sm: { size: 10, radius: 2, border: 1.5, gap: 6 }, // Today header
  md: { size: 12, radius: 3, border: 1.5, gap: 4 }, // ballot stubs
  lg: { size: 22, radius: 4, border: 2, gap: 6 }, // in-game progress
} as const;

/** Small square progress tiles. Large tiles mark the current item in lavender and pending ones in grey. */
export function ProgressTiles({
  states,
  size = 'md',
  accent = colors.lavender,
}: {
  states: TileState[];
  size?: keyof typeof SIZES;
  /** Fill for the current tile at the large size: the game's color. */
  accent?: string;
}) {
  const s = SIZES[size];
  return (
    <View style={{ flexDirection: 'row', gap: s.gap }} accessible={false} importantForAccessibility="no-hide-descendants">
      {states.map((state, i) => {
        const done = state === 'done';
        const current = state === 'current';
        return (
          <View
            key={i}
            style={{
              width: s.size,
              height: s.size,
              borderRadius: s.radius,
              borderWidth: done && size !== 'lg' ? 0 : s.border,
              borderColor: size === 'lg' && state === 'todo' ? colors.outline : colors.ink,
              backgroundColor: done ? colors.ink : current && size === 'lg' ? accent : colors.ground,
            }}
          />
        );
      })}
    </View>
  );
}

export function tilesFor(total: number, done: number, current = false): TileState[] {
  return Array.from({ length: total }, (_, i) => (i < done ? 'done' : current && i === done ? 'current' : 'todo'));
}
