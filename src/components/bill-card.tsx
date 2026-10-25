import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, type, type Level } from '@/theme';

import { BillChip } from './bill-chip';

type Props = {
  number: string;
  level: Level;
  /** e.g. "Texas House, 2025" */
  chamber: string;
  title: string;
  summary?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** The white bill card with a black border used in Roll Call and on sign-in. */
export function BillCard({ number, level, chamber, title, summary, children, style }: Props) {
  return (
    <View
      style={[
        {
          padding: 22,
          gap: 10,
          borderRadius: radius.bill,
          borderCurve: 'continuous',
          borderWidth: 2,
          borderColor: colors.ink,
          backgroundColor: colors.ground,
        },
        style,
      ]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BillChip number={number} level={level} />
        <Text style={type.meta}>{chamber}</Text>
      </View>
      <Text style={[type.billTitle, { marginTop: 4 }]}>{title}</Text>
      {summary ? <Text style={[type.body, { lineHeight: 21, color: colors.text2 }]}>{summary}</Text> : null}
      {children}
    </View>
  );
}
