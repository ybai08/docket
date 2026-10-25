import { Text, View } from 'react-native';

import { colors } from '@/theme';

type Props = {
  chamber: string;
  yeas?: number;
  nays?: number;
  /** Passed by unanimous consent: no recorded count. */
  consent?: boolean;
};

export function yeaShare({ yeas = 0, nays = 0, consent }: Omit<Props, 'chamber'>) {
  if (consent) return 1;
  const total = yeas + nays;
  return total ? yeas / total : 0;
}

/** One chamber's vote: grey track, tick at 50%, black dot at the Yea share, "% Yea" and the real count. */
export function VoteSlider(props: Props) {
  const { chamber, yeas, nays, consent } = props;
  const share = yeaShare(props);
  const pct = Math.round(share * 100);
  const count = consent ? 'Consent' : `${yeas}–${nays}`;

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      accessible
      accessibilityLabel={`${chamber}: ${pct}% Yea, ${consent ? 'passed by unanimous consent' : `${yeas} to ${nays}`}`}>
      <Text style={{ width: 92, fontSize: 12, color: colors.text2 }}>{chamber}</Text>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.hairline }}>
        <View style={{ position: 'absolute', left: '50%', top: -4, width: 2, height: 14, backgroundColor: colors.track }} />
        <View
          style={{
            position: 'absolute',
            top: -6,
            left: `${share * 100}%`,
            marginLeft: -9,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.ink,
            borderWidth: 2,
            borderColor: colors.ground,
            outlineWidth: 1.5,
            outlineColor: colors.ink,
            outlineStyle: 'solid',
          }}
        />
      </View>
      <Text style={{ width: 66, textAlign: 'right', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {pct}% Yea
      </Text>
      <Text
        style={{
          width: 56,
          textAlign: 'right',
          fontSize: consent ? 11 : 12,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        }}>
        {count}
      </Text>
    </View>
  );
}
