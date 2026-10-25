import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar, DemoTag } from '@/components/avatar';
import { ChevronRight, FlameIcon } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { ProgressTiles, tilesFor } from '@/components/progress-tiles';
import { SegmentedPills } from '@/components/segmented-pills';
import { TabScreen } from '@/components/tab-screen';
import { api } from '@/lib/api';
import { formatDayLong } from '@/lib/day';
import { requestSource, useRemote, type BoardRow, type FriendsData, type GroupSummary } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

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
    <TabScreen gap={20}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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
  const at = board.findIndex((r) => r.isYou);
  const you = at >= 0 ? board[at] : null;
  const leader = board[0];
  const ahead = at > 0 ? board[at - 1] : null;
  const headline =
    you && (you.playedToday || leader.isYou) ? `You're ${ordinalOf(at + 1)} of ${board.length}` : `${leader.name} leads with ${leader.points}`;
  const sub = !you
    ? null
    : !you.playedToday
      ? "Cast today's ballots to get on the board."
      : !ahead
        ? 'Ahead of all your friends today.'
        : ahead.points === you.points
          ? `Tied with ${ahead.name}.`
          : `${ahead.points - you.points} ${ahead.points - you.points === 1 ? 'point' : 'points'} behind ${ahead.name}.`;

  return (
    <View style={{ gap: 30 }}>
      <View style={card}>
        <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>Today, {formatDayLong(day)}</Text>
          <Text style={{ fontFamily: fonts.serif800, fontSize: 28, lineHeight: 32, letterSpacing: -0.3 }}>{headline}</Text>
          {sub ? <Text style={{ fontSize: 14, color: colors.text2 }}>{sub}</Text> : null}
        </View>
        {board.map((r, i) => (
          <BoardItem key={r.id} row={r} rank={i + 1} />
        ))}
      </View>

      {beyond.length > 0 && (
        <View style={{ gap: 12 }}>
          <SectionTitle title="Beyond your friends" note="Average points today" />
          <View style={{ flexDirection: 'row', paddingVertical: 14, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.muted }}>
            {beyond.map((b, i) => (
              <View
                key={b.label}
                accessible
                accessibilityLabel={`${b.label}: ${b.points ?? 'no data'}`}
                style={{ flex: 1, gap: 2, paddingHorizontal: 14, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.outline }}>
                <Text style={{ fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'] }}>{b.points ?? '–'}</Text>
                <Text style={{ fontSize: 12, lineHeight: 15, color: colors.text2 }} numberOfLines={2}>
                  {b.label.replace(/( players)?, average$/, '')}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function BoardItem({ row: r, rank }: { row: BoardRow; rank: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderTopWidth: 1,
        borderTopColor: r.isYou ? colors.ink : colors.hairline,
        backgroundColor: r.isYou ? colors.yellow : undefined,
      }}>
      <Text style={{ width: 20, fontFamily: fonts.serif800, fontSize: 20, fontVariant: ['tabular-nums'] }}>{rank}</Text>
      <Avatar id={r.id} name={r.name} size={38} you={r.isYou} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
            {r.name}
          </Text>
          {r.isDemo && <DemoTag />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {r.playedToday ? (
            <>
              <ProgressTiles states={tilesFor(3, r.games)} size="sm" />
              <Text style={[type.meta, { fontSize: 12, lineHeight: 15 }]}>{r.games === 3 ? 'All 3 ballots' : `${r.games} of 3 ballots`}</Text>
            </>
          ) : r.streak > 0 ? (
            <>
              <FlameIcon size={12} color={colors.text2} />
              <Text style={[type.meta, { fontSize: 12, lineHeight: 15 }]}>{`${r.streak}-day streak at risk`}</Text>
            </>
          ) : (
            <Text style={[type.meta, { fontSize: 12, lineHeight: 15 }]}>Not played yet</Text>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 24, lineHeight: 28, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{r.points}</Text>
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.meta }}>{r.points === 1 ? 'pt' : 'pts'}</Text>
      </View>
    </View>
  );
}

function FriendList({ data, onRespond }: { data: FriendsData; onRespond: (id: string, a: 'accept' | 'ignore') => void }) {
  return (
    <View style={{ gap: 28 }}>
      {data.requests.length > 0 && (
        <View style={[card, { gap: 12, padding: 16, backgroundColor: colors.yellow }]}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 20 }}>
            {data.requests.length} friend {data.requests.length === 1 ? 'request' : 'requests'}
          </Text>
          {data.requests.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar id={r.from.id} name={r.from.name} size={36} fill={colors.ground} bordered />
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
        <View style={{ gap: 12 }}>
          <SectionTitle
            title={`${data.friends.length} ${data.friends.length === 1 ? 'friend' : 'friends'}`}
            note="How often you voted the same way"
          />
          <View style={card}>
            {data.friends.map((f, i) => (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityLabel={`${f.name}, ${f.agreementPct === null ? 'not enough votes to compare' : `${f.agreementPct}% agreement`}`}
                onPress={() => router.push({ pathname: '/friend/[id]', params: { id: f.id } })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  paddingLeft: 16,
                  paddingRight: 12,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.hairline,
                  backgroundColor: pressed ? colors.muted : colors.ground,
                })}>
                <Avatar id={f.id} name={f.name} size={42} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ gap: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                        {f.name}
                      </Text>
                      {f.isDemo && <DemoTag />}
                    </View>
                    <Text style={[type.meta, { fontSize: 12, lineHeight: 16 }]}>
                      {f.agreementPct === null
                        ? 'Play more days to compare'
                        : `${f.sharedBills} ${f.sharedBills === 1 ? 'bill' : 'bills'} in common`}
                    </Text>
                  </View>
                  {f.agreementPct !== null && (
                    // Teal for agreed, lavender for disagreed: the same meaning as Roll Call results.
                    <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 }}>
                      <View style={{ flex: f.agreementPct, backgroundColor: colors.teal }} />
                      <View style={{ flex: 100 - f.agreementPct, backgroundColor: colors.lavender }} />
                    </View>
                  )}
                </View>
                <Text style={{ minWidth: 52, textAlign: 'right', fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {f.agreementPct === null ? '–' : `${f.agreementPct}%`}
                </Text>
                <ChevronRight size={14} color={colors.meta} />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 2 }}>
            <Legend color={colors.teal} label="Same vote" />
            <Legend color={colors.lavender} label="Different vote" />
          </View>
        </View>
      )}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: colors.text2 }}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontFamily: fonts.serif700, fontSize: 22, lineHeight: 26 }} accessibilityRole="header">
        {title}
      </Text>
      {note ? <Text style={{ fontSize: 14, color: colors.meta }}>{note}</Text> : null}
    </View>
  );
}

const card = {
  borderWidth: 2,
  borderRadius: 14,
  borderCurve: 'continuous' as const,
  backgroundColor: colors.ground,
  overflow: 'hidden' as const,
};

const GROUP_FILLS = [colors.teal, colors.lavender, colors.yellow];

function Groups() {
  const { data } = useRemote<{ groups: GroupSummary[] }>('/groups');
  const groups = data?.groups ?? [];
  return (
    <View style={{ gap: 10 }}>
      {groups.length === 0 && <Empty title="No groups yet" body="Make one for your dorm floor, class or club." />}
      {groups.map((g, i) => (
        <Pressable
          key={g.id}
          accessibilityRole="button"
          disabled={g.pending}
          onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: GROUP_FILLS[i % GROUP_FILLS.length],
            opacity: pressed ? 0.7 : 1,
          })}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: colors.ground,
              borderWidth: 1.5,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontFamily: fonts.serif800, fontSize: g.badge.length > 2 ? 17 : 20 }}>{g.badge}</Text>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ fontFamily: fonts.serif700, fontSize: 19 }}>{g.name}</Text>
            <Text style={{ fontSize: 13 }}>
              {g.pending
                ? 'Waiting for the admin to approve you'
                : `${g.members} ${g.members === 1 ? 'member' : 'members'}.${g.rank ? ` You're ${ordinalOf(g.rank)} this week.` : ''}`}
            </Text>
          </View>
          {!g.pending && <ChevronRight size={14} />}
        </Pressable>
      ))}
      <View style={{ gap: 10, marginTop: 6 }}>
        <PillButton label="Create a group" style={{ alignSelf: 'stretch', height: 50 }} onPress={() => router.push('/group/new')} />
        <PillButton
          label="Join with a code"
          variant="outline"
          style={{ alignSelf: 'stretch', height: 50 }}
          onPress={() => router.push('/group/join')}
        />
      </View>
      <Text style={[type.meta, { textAlign: 'center' }]}>Groups hold up to 50 people. Join by link or QR code.</Text>
    </View>
  );
}

function ordinalOf(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 4, paddingVertical: 20, paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.muted }}>
      <Text style={{ fontFamily: fonts.serif700, fontSize: 20 }}>{title}</Text>
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
