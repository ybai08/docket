import { Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/** Every other person gets the same fill; only you stand out, in ink. */
const FRIEND_FILL = colors.lavender;

export function Avatar({
  id,
  name,
  size = 34,
  you,
  serif,
  bordered,
  fill,
}: {
  id: string;
  name: string;
  size?: number;
  you?: boolean;
  serif?: boolean;
  bordered?: boolean;
  fill?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: you ? colors.ink : (fill ?? FRIEND_FILL),
        borderWidth: bordered ? 2 : 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          fontSize: serif ? size * 0.44 : size * 0.41,
          fontWeight: '700',
          fontFamily: serif ? fonts.serif700 : undefined,
          color: you ? colors.ground : colors.ink,
        }}>
        {name.replace('@', '').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

/** Small tag on sample accounts so demo data is never mistaken for real people. */
export function DemoTag() {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, borderWidth: 1, borderColor: colors.outline }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.meta }}>Demo</Text>
    </View>
  );
}
