import { router, useLocalSearchParams } from 'expo-router';
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
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Avatar id={data.id} name={data.name} size={72} serif bordered />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.serif800, fontSize: 44, lineHeight: 46 }}>
                {data.agreement.pct === null ? '–' : `${data.agreement.pct}%`}
              </Text>
              <Text style={{ fontSize: 14 }}>
                {data.agreement.pct === null
                  ? `${data.agreement.shared} of the same bills so far. Agreement shows after ${data.agreement.minShared}.`
                  : `You agree on ${data.agreement.agreed} of ${data.agreement.shared} bills`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {data.votesShared && (
                  <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.yellow }}>
                    <Text style={{ fontSize: 12, fontWeight: '800' }}>You both share votes</Text>
                  </View>
                )}
                {data.isDemo && <DemoTag />}
              </View>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={type.section} accessibilityRole="header">
              By topic
            </Text>
            {data.topics.length ? (
              data.topics.map((t) => (
                <View key={t.topic} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`${t.topic}: ${t.pct}% agreement`}>
                  <Text style={{ width: 120, fontSize: 14 }} numberOfLines={1}>
                    {t.topic}
                  </Text>
                  <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.muted, overflow: 'hidden' }}>
                    <View style={{ width: `${t.pct}%`, height: 10, backgroundColor: colors.teal }} />
                  </View>
                  <Text style={{ width: 40, textAlign: 'right', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{t.pct}%</Text>
                </View>
              ))
            ) : (
              <Text style={type.meta}>A topic shows up once you have both voted on 5 of its bills.</Text>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={type.section} accessibilityRole="header">
              Recent bills
            </Text>
            {data.votesShared ? (
              data.recent.map((b) => {
                const same = b.mine === b.theirs;
                return (
                  <View key={b.number} style={{ gap: 6, padding: 12, borderRadius: 12, backgroundColor: same ? colors.teal : colors.lavender }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: '700' }}>
                        {b.number}, {b.title}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800' }}>{same ? 'Agreed' : 'Split'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Text style={{ fontSize: 14 }}>
                        You: <Text style={{ fontWeight: '700' }}>{b.mine === 'yea' ? 'Yea' : 'Nay'}</Text>
                      </Text>
                      <Text style={{ fontSize: 14 }}>
                        {data.name}: <Text style={{ fontWeight: '700' }}>{b.theirs === 'yea' ? 'Yea' : 'Nay'}</Text>
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={{ padding: 12, borderRadius: 12, backgroundColor: colors.muted, fontSize: 14, lineHeight: 19, color: colors.text2 }}>
                {`How each of you voted on a bill shows only when you both turn on "Share my vote on each bill". You can share with just ${data.name} from the ⋯ menu.`}
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
