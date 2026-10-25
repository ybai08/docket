import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedPills<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.muted }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              height: 36,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.ink : 'transparent',
            }}>
            <Text style={{ fontSize: 14, fontWeight: on ? '700' : '600', color: on ? colors.ground : colors.ink }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
