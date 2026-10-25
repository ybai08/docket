import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar, DemoTag } from '@/components/avatar';
import { PillButton } from '@/components/pill-button';
import { SegmentedPills } from '@/components/segmented-pills';
import { TabScreen } from '@/components/tab-screen';
import { api } from '@/lib/api';
import { formatDayLong } from '@/lib/day';
import { requestSource, useRemote, type BoardRow, type FriendsData } from '@/lib/social';
import { colors, type } from '@/theme';

type Tab = 'board' | 'friends' | 'groups';

export default function FriendsScreen() {
  const [tab, setTab] = useState<Tab>('board');
  const { data, error, loading, reload, setData } = useRemote<FriendsData>('/friends');

  async function respond(id: string, action: 'accept' | 'ignore') {
    // Optimistic: the request leaves the list right away; ignoring is silent for the sender.
    setData((d) => (d ? { ...d, requests: d.requests.filter((r) => r.id !== id) } : d));
    await api(`/friend-requests/${id}/${action}`, { method: 'POST' }).catch(() => {});
    reload();
  }

  return (
    <TabScreen gap={14}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.ink,
        }}>
        <Text style={type.title} accessibilityRole="header">
          Friends
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Privacy and notifications"
            onPress={() => router.push('/privacy')}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: colors.outline,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round">
              <Path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
            </Svg>
          </Pressable>
          <PillButton
            size="md"
            label="Invite"
            style={{ height: 40, paddingHorizontal: 16 }}
            onPress={() => router.push('/invite-friends')}
          />
        </View>
      </View>

      <SegmentedPills<Tab>
        options={[
          { value: 'board', label: 'Leaderboard' },
          { value: 'friends', label: 'Friends' },
          { value: 'groups', label: 'Groups' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && !data && <ActivityIndicator color={colors.ink} style={{ marginTop: 24 }} />}
      {error && !data && (
        <View style={{ gap: 10, alignItems: 'flex-start' }}>
          <Text style={[type.meta, { color: colors.text2 }]}>{error}</Text>
          <PillButton size="md" variant="outline" label="Retry" onPress={reload} />
        </View>
      )}

      {data && tab === 'board' && <Board data={data} />}
      {data && tab === 'friends' && <FriendList data={data} onRespond={respond} />}
      {tab === 'groups' && <Groups />}
    </TabScreen>
  );
}

function Board({ data }: { data: FriendsData }) {
  const { board, beyond, day } = data.leaderboard;
  if (board.length <= 1) {
    return <Empty title="Your leaderboard is empty" body="Invite friends to race each other on today's ballots." />;
  }
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '800' }}>Today, {formatDayLong(day)}</Text>
        <Text style={{ fontSize: 12, fontWeight: '800' }}>Points</Text>
      </View>
      {board.map((r, i) => (
        <View
          key={r.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 11,
            paddingHorizontal: 6,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
            backgroundColor: r.isYou ? colors.yellow : undefined,
            borderRadius: r.isYou ? 10 : 0,
          }}>
          <Text style={{ width: 18, fontSize: 15, fontWeight: '800' }}>{i + 1}</Text>
          <Avatar id={r.id} name={r.name} you={r.isYou} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '600' }}>{r.name}</Text>
              {r.isDemo && <DemoTag />}
            </View>
            <Text style={type.meta}>{boardDetail(r)}</Text>
          </View>
          <Text style={{ fontSize: 20, fontVariant: ['tabular-nums'] }}>{r.points}</Text>
        </View>
      ))}
      <Text style={{ marginTop: 16, marginBottom: 6, paddingHorizontal: 6, fontSize: 13, fontWeight: '800' }}>
        Beyond your friends
      </Text>
      {beyond.map((b) => (
        <View
          key={b.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 10,
            paddingHorizontal: 6,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
          }}>
          <Text style={{ fontSize: 15 }}>{b.label}</Text>
          <Text style={{ fontSize: 15, fontVariant: ['tabular-nums'] }}>{b.points ?? '–'}</Text>
        </View>
      ))}
    </View>
  );
}

function boardDetail(r: BoardRow) {
  if (!r.playedToday) return r.streak > 0 ? `Streak at risk: ${r.streak} ${r.streak === 1 ? 'day' : 'days'}` : 'Not played yet';
  return r.games === 3 ? 'All 3 ballots' : `${r.games} of 3 ballots`;
}

function FriendList({ data, onRespond }: { data: FriendsData; onRespond: (id: string, a: 'accept' | 'ignore') => void }) {
  return (
    <View style={{ gap: 14 }}>
      {data.requests.length > 0 && (
        <View style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.yellow }}>
          <Text style={{ fontSize: 14, fontWeight: '800' }}>
            {data.requests.length} friend {data.requests.length === 1 ? 'request' : 'requests'}
          </Text>
          {data.requests.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar id={r.from.id} name={r.from.name} size={32} fill={colors.ground} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600' }}>{r.from.name}</Text>
                <Text style={{ fontSize: 12, color: colors.text2 }}>{requestSource(r.source)}</Text>
              </View>
              <SmallPill label="Ignore" onPress={() => onRespond(r.id, 'ignore')} />
              <SmallPill label="Accept" filled onPress={() => onRespond(r.id, 'accept')} />
            </View>
          ))}
        </View>
      )}

      {data.friends.length === 0 ? (
        <Empty title="No friends yet" body="Send your invite link or have a friend scan your QR code." />
      ) : (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '800' }}>
              {data.friends.length} {data.friends.length === 1 ? 'friend' : 'friends'}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '800' }}>You agree</Text>
          </View>
          {data.friends.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/friend/[id]', params: { id: f.id } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 11,
                paddingHorizontal: 6,
                borderTopWidth: 1,
                borderTopColor: colors.hairline,
                opacity: pressed ? 0.6 : 1,
              })}>
              <Avatar id={f.id} name={f.name} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{f.name}</Text>
                  {f.isDemo && <DemoTag />}
                </View>
                <Text style={type.meta}>
                  {f.agreementPct === null ? 'Play more days to compare' : f.votesShared ? 'Votes shared both ways' : 'Agreement only'}
                </Text>
              </View>
              <Text style={{ fontSize: 20, fontVariant: ['tabular-nums'] }}>
                {f.agreementPct === null ? '–' : `${f.agreementPct}%`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Groups() {
  return (
    <View style={{ gap: 10 }}>
      <Empty title="No groups yet" body="Make one for your dorm floor, class or club." />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <PillButton label="Create a group" style={{ flex: 1, height: 48 }} onPress={() => router.push('/group/new')} />
        <PillButton label="Join with a code" variant="outline" style={{ flex: 1, height: 48 }} onPress={() => router.push('/group/join')} />
      </View>
      <Text style={[type.meta, { textAlign: 'center' }]}>Groups hold up to 50 people. Join by link or QR code.</Text>
    </View>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 4, paddingVertical: 20, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.muted }}>
      <Text style={{ fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.text2 }}>{body}</Text>
    </View>
  );
}

function SmallPill({ label, filled, onPress }: { label: string; filled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: filled ? 0 : 1.5,
        backgroundColor: filled ? colors.ink : 'transparent',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: filled ? colors.ground : colors.ink }}>{label}</Text>
    </Pressable>
  );
}
