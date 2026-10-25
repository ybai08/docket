import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { colors, radius, type } from '@/theme';

type Props = {
  color: string;
  title: string;
  subtitle: string;
  glyph: ReactNode;
  /** Left side of the tear-off stub: progress, result or a "New today" tag. */
  status: ReactNode;
  action: ReactNode;
};

const NOTCH = 16;

/** Today's game card: colored ticket with a dashed, notched tear-off stub. */
export function BallotStubCard({ color, title, subtitle, glyph, status, action }: Props) {
  return (
    <View style={{ backgroundColor: color, borderRadius: radius.card, borderCurve: 'continuous', paddingTop: 16, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.game, { lineHeight: 30 }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={type.body}>{subtitle}</Text>
        </View>
        {glyph}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 10,
          paddingBottom: 12,
          minHeight: 60,
        }}>
        {/* Dashed tear line with half-circle notches cut from each edge. */}
        <Svg style={{ position: 'absolute', left: 0, right: 0, top: -1 }} height={2} width="100%">
          <Line x1="0" y1="1" x2="100%" y2="1" stroke={colors.dashed} strokeWidth={2} strokeDasharray="6 4" />
        </Svg>
        <View style={[notch, { left: -16 - NOTCH / 2 }]} />
        <View style={[notch, { right: -16 - NOTCH / 2 }]} />
        {status}
        {action}
      </View>
    </View>
  );
}

const notch = {
  position: 'absolute' as const,
  top: -9,
  width: NOTCH,
  height: NOTCH,
  borderRadius: NOTCH / 2,
  backgroundColor: colors.ground,
};
