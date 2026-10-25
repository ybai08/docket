import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Avatar, DemoTag } from '@/components/avatar';
import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me-context';
import { useRemote, type FriendDetail } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

export default function FriendProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useMe();
  const { data, error, reload } = useRemote<FriendDetail>(`/friends/${id}`);

  function manage() {
    if (!data) return;
    const name = data.name;
    const mine = data.myOverride ?? profile?.shareVotes ?? false;
    const options = [
      mine ? `Stop sharing my votes with ${name}` : `Share my votes with ${name}`,
      `Remove ${name}`,
      `Block ${name}`,
      'Cancel',
    ];
    const run = async (i: number) => {
      if (i === 0) {
        await api(`/friends/${id}/sharing`, { method: 'PUT', body: { share: !mine } }).catch(() => {});
        reload();
      } else if (i === 1) {
        await api(`/friends/${id}`, { method: 'DELETE' }).catch(() => {});
        router.back();
      } else if (i === 2) {
        Alert.alert(`Block ${name}?`, `${name} won't be told. You won't see each other's rank in shared groups, and they can't send you requests.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              await api('/blocks', { method: 'POST', body: { userId: id } }).catch(() => {});
              router.back();
            },
          },
        ]);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: [1, 2], title: `Removing or blocking is silent. ${name} won't be told.` },
        run,
      );
    } else {
      Alert.alert(name, undefined, [
        { text: options[0], onPress: () => run(0) },
        { text: options[1], onPress: () => run(1) },
        { text: options[2], style: 'destructive', onPress: () => run(2) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader
        title={data?.name ?? ''}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove, block or change sharing with ${data?.name ?? 'this friend'}`}
            onPress={manage}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill={colors.ink}>
              <Circle cx="5" cy="12" r="2" />
              <Circle cx="12" cy="12" r="2" />
              <Circle cx="19" cy="12" r="2" />
            </Svg>
          </Pressable>
        }
      />
      {!data ? (
        <View style={{ padding: 24, gap: 12 }}>
          {error ? (
            <>
              <Text style={type.meta}>{error}</Text>
              <PillButton size="md" variant="outline" label="Retry" onPress={reload} />
            </>
          ) : (
            <ActivityIndicator color={colors.ink} />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 30 }}>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Avatar id={data.id} name={data.name} size={64} serif bordered />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>How often you vote the same</Text>
                <Text style={{ fontFamily: fonts.serif800, fontSize: 44, lineHeight: 48 }}>
                  {data.agreement.pct === null ? '–' : `${data.agreement.pct}%`}
                </Text>
              </View>
            </View>
            {data.agreement.pct !== null && (
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' }}>
                <View style={{ width: `${data.agreement.pct}%`, height: 8, backgroundColor: colors.teal }} />
              </View>
            )}
            <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>
              {data.agreement.pct === null
                ? `You've both voted on ${data.agreement.shared} of the same bills. Your agreement shows after ${data.agreement.minShared}.`
                : `You and ${data.name} voted the same way on ${data.agreement.agreed} of the ${data.agreement.shared} bills you've both voted on.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {data.votesShared && (
                <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.yellow }}>
                  <Text style={{ fontSize: 12, fontWeight: '800' }}>You both share your votes</Text>
                </View>
              )}
              {data.isDemo && <DemoTag />}
            </View>
          </View>

          <Section title="By topic" note={data.topics.length ? "Topics where you've both voted on 5 or more bills" : undefined}>
            {data.topics.length ? (
              data.topics.map((t, i) => (
                <View
                  key={t.topic}
                  accessible
                  accessibilityLabel={`${t.topic}: ${t.pct}% agreement across ${t.shared} bills`}
                  style={{ gap: 6, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                      {t.topic}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.meta }}>{t.shared} bills</Text>
                    <Text style={{ width: 44, textAlign: 'right', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{t.pct}%</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: 'hidden' }}>
                    <View style={{ width: `${t.pct}%`, height: 6, backgroundColor: colors.teal }} />
                  </View>
                </View>
              ))
            ) : (
              <Note>{"No topic has 5 bills you've both voted on yet. Keep playing Roll Call and they'll show up here."}</Note>
            )}
          </Section>

          <Section title="How you each voted" note={data.votesShared ? 'Your most recent bills in common' : undefined}>
            {data.votesShared ? (
              <View style={{ gap: 22, paddingTop: 6 }}>
                <VoteGroup
                  label="Voted the same"
                  color={colors.teal}
                  bills={data.recent.filter((b) => b.mine === b.theirs)}
                  name={data.name}
                />
                <VoteGroup
                  label="Voted differently"
                  color={colors.lavender}
                  bills={data.recent.filter((b) => b.mine !== b.theirs)}
                  name={data.name}
                />
              </View>
            ) : (
              <Note>
                {`You'll see each bill's votes once you both turn on "Share my vote on each bill". You can share with just ${data.name} from the ⋯ menu.`}
              </Note>
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: fonts.serif700, fontSize: 22, lineHeight: 26 }} accessibilityRole="header">
          {title}
        </Text>
        {note ? <Text style={{ fontSize: 14, color: colors.meta }}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <Text style={{ padding: 14, borderRadius: 12, backgroundColor: colors.muted, fontSize: 14, lineHeight: 19, color: colors.text2 }}>{children}</Text>;
}

type RecentBill = FriendDetail['recent'][number];
const word = (v: 'yea' | 'nay') => (v === 'yea' ? 'Yea' : 'Nay');

/** Bills you agreed or split on, under a small colored heading with the count. */
function VoteGroup({ label, color, bills, name }: { label: string; color: string; bills: RecentBill[]; name: string }) {
  if (!bills.length) return null;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
        <Text style={{ fontSize: 14, fontWeight: '800' }}>{label}</Text>
        <Text style={{ fontSize: 14, color: colors.meta, fontVariant: ['tabular-nums'] }}>{bills.length}</Text>
      </View>
      {bills.map((b) => {
        const same = b.mine === b.theirs;
        return (
          <View
            key={b.number}
            accessible
            accessibilityLabel={`${b.title}, ${b.number}. You voted ${word(b.mine)}, ${name} voted ${word(b.theirs)}.`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 11,
              borderTopWidth: 1,
              borderTopColor: colors.hairline,
            }}>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600' }}>{b.title}</Text>
              <Text style={{ fontSize: 12, color: colors.meta }}>{b.number}</Text>
            </View>
            {same ? (
              <Text style={{ fontSize: 14, color: colors.text2 }}>
                Both <Text style={{ fontWeight: '700', color: colors.ink }}>{word(b.mine)}</Text>
              </Text>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, color: colors.text2 }}>
                  You <Text style={{ fontWeight: '700', color: colors.ink }}>{word(b.mine)}</Text>
                </Text>
                <Text style={{ fontSize: 14, color: colors.text2 }} numberOfLines={1}>
                  {name} <Text style={{ fontWeight: '700', color: colors.ink }}>{word(b.theirs)}</Text>
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
