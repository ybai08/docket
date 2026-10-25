import { TabList, TabSlot, TabTrigger, Tabs, defaultTabsSlotRender, type TabTriggerSlotProps } from 'expo-router/ui';
import { cloneElement, type ComponentProps, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

// The web has no native tab bar: expo-router draws NativeTabs as a strip along the top. This draws the
// iOS 26 floating tab pill instead: three tabs, SF Symbol look-alikes, and a grey capsule behind the
// selected one. Tab screens leave room for it (TabScreen adds bottom padding on the web).
export default function TabsLayout() {
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1, minHeight: 0 }} renderFn={boundedRender} />
      <TabList asChild>
        <View
          style={{
            position: 'absolute',
            bottom: 14,
            alignSelf: 'center',
            flexDirection: 'row',
            gap: 2,
            padding: 4,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.88)',
            borderWidth: 0.5,
            borderColor: 'rgba(0,0,0,0.08)',
            boxShadow: '0px 8px 24px rgba(0,0,0,0.12)',
            backdropFilter: 'blur(20px)',
          }}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton label="Today" icon={(on) => <CalendarIcon filled={on} />} />
          </TabTrigger>
          <TabTrigger name="friends" href="/friends" asChild>
            <TabButton label="Friends" icon={(on) => <PeopleIcon filled={on} />} />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton label="Profile" icon={(on) => <PersonIcon filled={on} />} />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

// TabSlot's default styles let the focused screen grow to its content height (flexShrink 0), so on the web
// a tab's ScrollView never gets a bounded height and can't scroll. Keep the screen to the viewport instead.
const boundedRender: NonNullable<ComponentProps<typeof TabSlot>['renderFn']> = (descriptor, opts) => {
  const el = defaultTabsSlotRender(descriptor, opts) as ReactElement<{ style?: unknown }> | null;
  return el && cloneElement(el, { style: [el.props.style, { flexShrink: 1, minHeight: 0 }] });
};

function TabButton({
  label,
  icon,
  isFocused,
  ...props
}: Omit<TabTriggerSlotProps, 'ref'> & { label: string; icon: (on: boolean) => React.ReactNode }) {
  const on = !!isFocused;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={{
        width: 88,
        height: 54,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        backgroundColor: on ? 'rgba(0,0,0,0.07)' : 'transparent',
      }}>
      {icon(on)}
      <Text style={{ fontSize: 11, fontWeight: on ? '700' : '600', color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

const S = 26;

function CalendarIcon({ filled }: { filled: boolean }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 26 26">
      <Rect x="3" y="4.5" width="20" height="18" rx="3.5" fill="none" stroke={colors.ink} strokeWidth={1.9} />
      <Path d="M3 9.5h20" stroke={colors.ink} strokeWidth={filled ? 4.5 : 1.9} />
      {[0, 1, 2, 3].flatMap((c) =>
        [0, 1].map((r) => <Circle key={`${c}${r}`} cx={7.6 + c * 3.6} cy={14.2 + r * 3.6} r={1.05} fill={colors.ink} />),
      )}
    </Svg>
  );
}

function PeopleIcon({ filled }: { filled: boolean }) {
  const f = filled ? colors.ink : 'none';
  return (
    <Svg width={S + 4} height={S} viewBox="0 0 30 26">
      <Circle cx="11" cy="8.5" r="4.2" fill={f} stroke={colors.ink} strokeWidth={1.9} />
      <Path d="M2.8 21.5c.6-4.4 3.9-6.8 8.2-6.8s7.6 2.4 8.2 6.8z" fill={f} stroke={colors.ink} strokeWidth={1.9} strokeLinejoin="round" />
      <Circle cx="20.5" cy="9.5" r="3.5" fill={f} stroke={colors.ink} strokeWidth={1.9} />
      <Path d="M20.6 15.3c3.8 0 6.4 2.3 6.9 6.2h-6.6c-.3-2.6-1.4-4.6-3.2-5.7.8-.3 1.8-.5 2.9-.5z" fill={f} stroke={colors.ink} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

function PersonIcon({ filled }: { filled: boolean }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 26 26">
      <Circle cx="13" cy="13" r="10.5" fill={filled ? colors.ink : 'none'} stroke={colors.ink} strokeWidth={1.9} />
      <Circle cx="13" cy="10.4" r="3.6" fill={filled ? colors.ground : 'none'} stroke={filled ? colors.ground : colors.ink} strokeWidth={1.9} />
      <Path
        d="M6.4 20.2c1.4-2.6 3.8-3.9 6.6-3.9s5.2 1.3 6.6 3.9"
        fill="none"
        stroke={filled ? colors.ground : colors.ink}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}
