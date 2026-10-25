import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActionSheetIOS, ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { SwitchRow } from '@/components/switch-row';
import { api } from '@/lib/api';
import { groupLink } from '@/lib/invite';
import { useRemote, type GroupDetail, type GroupSplit } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

const UUID = /^[0-9a-f-]{36}$/i;

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // docket://group/<code> lands here; send codes to the join preview.
  if (!UUID.test(id)) return <Redirect href={{ pathname: '/group/join', params: { code: id } }} />;
  return <Group id={id} />;
}

function Group({ id }: { id: string }) {
  const { data: g, error, reload, setData } = useRemote<GroupDetail>(`/groups/${id}`);

  async function setSplits(includeInSplits: boolean) {
    setData((d) => (d ? { ...d, includeInSplits } : d));
    await api(`/groups/${id}/me`, { method: 'PATCH', body: { includeInSplits } }).catch(() => {});
    reload();
  }

  function invite() {
    if (!g) return;
    Share.share({ message: `Join "${g.name}" on Docket with code ${g.code}: ${groupLink(g.code)}` });
  }

  function settings() {
    if (!g) return;
    const leave = async () => {
      Alert.alert(`Leave ${g.name}?`, 'Your past votes stay in its anonymous splits.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const me = g.people.find((p) => p.isYou);
            await api(`/groups/${id}/members/${me?.id ?? 'me'}`, { method: 'DELETE' }).catch(() => {});
            router.back();
          },
        },
      ]);
    };
    if (!g.isAdmin) {
      return Alert.alert(g.name, `Group code ${g.code}`, [
        { text: 'Leave group', style: 'destructive', onPress: leave },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
    const options = [
      'Rename group',
      g.approvalRequired ? 'Let anyone join with the code' : 'Approve new members',
      'Reset the code',
      'Members',
      'Cancel',
    ];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 4, title: `Code ${g.code}` }, async (i) => {
      if (i === 0) {
        Alert.prompt('Rename group', undefined, async (name) => {
          await api(`/groups/${id}`, { method: 'PATCH', body: { name } }).catch((err: Error) => Alert.alert(err.message));
          reload();
        }, 'plain-text', g.name);
      } else if (i === 1) {
        await api(`/groups/${id}`, { method: 'PATCH', body: { approvalRequired: !g.approvalRequired } }).catch(() => {});
        reload();
      } else if (i === 2) {
        Alert.alert('Reset the code?', 'The old code and link stop working. Current members stay.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            onPress: async () => {
              await api(`/groups/${id}/reset-code`, { method: 'POST' }).catch(() => {});
              reload();
            },
          },
        ]);
      } else if (i === 3) {
        manageMembers();
      }
    });
  }

  function manageMembers() {
    if (!g) return;
    const others = g.people.filter((p) => !p.isYou);
    const options = [...others.map((p) => (p.status === 'pending' ? `Approve ${p.name}` : `Remove ${p.name}`)), 'Done'];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, title: 'Removing someone is silent.' },
      async (i) => {
        const p = others[i];
        if (!p) return;
        const path = p.status === 'pending' ? `/groups/${id}/members/${p.id}/approve` : `/groups/${id}/members/${p.id}`;
        await api(path, { method: p.status === 'pending' ? 'POST' : 'DELETE' }).catch((err: Error) => Alert.alert(err.message));
        reload();
      },
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Group"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Group settings"
            onPress={settings}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
              <Circle cx="12" cy="12" r="3" />
              <Path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </Svg>
          </Pressable>
        }
      />
      {!g ? (
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
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, backgroundColor: colors.teal }}>
              <View
                style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: colors.ground, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.serif800, fontSize: g.badge.length > 2 ? 20 : 24 }}>{g.badge}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.serif700, fontSize: 24, lineHeight: 27 }} accessibilityRole="header">
                  {g.name}
                </Text>
                <Text style={{ fontSize: 13 }}>
                  {g.members} {g.members === 1 ? 'member' : 'members'}, {g.playedToday} played today
                </Text>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={type.section}>This week</Text>
                <Text style={{ fontSize: 12, fontWeight: '800' }}>Points</Text>
              </View>
              {g.board
                .map((r, i) => ({ ...r, rank: i + 1 }))
                .filter((r, i) => i < 5 || r.isYou)
                .map((r) => (
                <View
                  key={r.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 4,
                    borderTopWidth: 1,
                    borderTopColor: colors.hairline,
                    backgroundColor: r.isYou ? colors.yellow : undefined,
                    borderRadius: r.isYou ? 8 : 0,
                  }}>
                  <Text style={{ width: 22, fontSize: 15, fontWeight: '800' }}>{r.rank}</Text>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: r.isYou ? '700' : '400' }}>{r.name}</Text>
                  <Text style={{ fontSize: 15, fontVariant: ['tabular-nums'] }}>{r.points}</Text>
                </View>
                ))}
              <Text style={type.meta}>Resets every Monday.</Text>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={type.section}>How the group voted today</Text>
              {g.today.length ? (
                g.today.map((s) => <Split key={s.billId} split={s} minVoters={g.minVoters} />)
              ) : (
                <Text style={type.meta}>No one in the group has voted today yet.</Text>
              )}
            </View>

            <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.muted, gap: 4 }}>
              <Text style={{ fontFamily: fonts.serif700, fontSize: 19 }}>Weekly recap</Text>
              <Text style={{ fontSize: 14, lineHeight: 19 }}>
                {g.recap ?? 'Your recap appears once a few bills have enough votes to show a split.'}
              </Text>
            </View>

            <View style={{ borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' }}>
              <SwitchRow
                title="Count me in group splits"
                detail={g.includeInSplits ? 'Your votes add to the anonymous totals' : 'Off. Your votes are left out of the totals'}
                value={g.includeInSplits}
                onChange={setSplits}
              />
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <PillButton label="Invite to this group" style={{ height: 52 }} onPress={invite} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Split({ split: s, minVoters }: { split: GroupSplit; minVoters: number }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {s.number}, {s.title}
        </Text>
        <Text style={{ fontSize: 14, color: colors.text2 }}>{s.voters} voted</Text>
      </View>
      {s.yeaPct === null ? (
        <View
          style={{
            height: 22,
            paddingHorizontal: 8,
            borderRadius: 6,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: colors.track,
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {s.hiddenReason === 'unanimous'
              ? 'Hidden: everyone voted alike, and fewer than 10 voted'
              : `Hidden until ${minVoters} members vote, so no one's vote can be guessed`}
          </Text>
        </View>
      ) : (
        <View
          accessible
          accessibilityLabel={`${s.yeaPct}% Yea, ${100 - s.yeaPct}% Nay`}
          style={{ flexDirection: 'row', height: 22, borderRadius: 6, overflow: 'hidden', borderWidth: 1.5 }}>
          <View style={{ width: `${s.yeaPct}%`, backgroundColor: colors.ink, justifyContent: 'center', paddingLeft: 8 }}>
            {s.yeaPct >= 25 && <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ground }}>Yea {s.yeaPct}%</Text>}
          </View>
          <View style={{ flex: 1, backgroundColor: colors.ground, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '800' }}>
              {100 - s.yeaPct >= 25 ? `Nay ${100 - s.yeaPct}%` : `${100 - s.yeaPct}%`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
