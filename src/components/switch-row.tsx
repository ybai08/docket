import { Switch, Text, View } from 'react-native';

import { colors } from '@/theme';

/** A settings row: bold title, detail line, and a black-track switch. */
export function SwitchRow({
  title,
  detail,
  value,
  onChange,
  disabled,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.text2 }}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.ink, false: colors.outline }}
        ios_backgroundColor={colors.outline}
      />
    </View>
  );
}
