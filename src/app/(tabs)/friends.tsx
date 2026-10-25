import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar, DemoTag } from '@/components/avatar';
import { ChevronRight } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { SegmentedPills } from '@/components/segmented-pills';
import { TabScreen } from '@/components/tab-screen';
import { api } from '@/lib/api';
import { formatDayLong } from '@/lib/day';
import { requestSource, useRemote, type BoardRow, type FriendsData, type GroupSummary } from '@/lib/social';
import { colors, fonts, levelColor, type } from '@/theme';

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
  const ahead = at > 0 ? board[at - 1] : null;
  // One scale for friends and the wider averages so the bars compare.
  const max = Math.max(1, ...board.map((r) => r.points), ...beyond.map((b) => b.points ?? 0));
  const note = !you
    ? null
    : !you.playedToday
      ? board[0].isYou
        ? 'Nobody has scored yet today.'
        : `${board[0].name} leads with ${board[0].points}. Play to climb.`
      : !ahead
        ? 'Ahead of all your friends.'
        : ahead.points === you.points
          ? `Tied with ${ahead.name}.`
          : `${ahead.points - you.points} ${ahead.points - you.points === 1 ? 'point' : 'points'} behind ${ahead.name}.`;

  return (
    <View style={{ gap: 26 }}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>Today, {formatDayLong(day)}</Text>
        {you ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            {/* Newsreader numerals sit high in their line box; nudge them down to sit level with the text beside them. */}
            <View
              style={{ flexDirection: 'row', transform: [{ translateY: 6 }] }}
              accessible
              accessibilityLabel={`${ordinalOf(at + 1)} place`}>
              <Text style={{ fontFamily: fonts.serif800, fontSize: 56, lineHeight: 58, letterSpacing: -1 }}>{at + 1}</Text>
              <Text style={{ fontFamily: fonts.serif700, fontSize: 20, lineHeight: 24, marginTop: 5, marginLeft: 1 }}>
                {ordinalOf(at + 1).replace(/^\d+/, '')}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 17, fontWeight: '700' }}>
                of {board.length} friends today
              </Text>
              {note ? <Text style={{ fontSize: 14, lineHeight: 19, color: colors.text2 }}>{note}</Text> : null}
            </View>
          </View>
        ) : null}
        {you && !you.playedToday ? (
          <PillButton label="Play today's ballots" size="md" style={{ alignSelf: 'flex-start', height: 42 }} onPress={() => router.navigate('/')} />
        ) : null}
      </View>

      <View>
        {board.map((r, i) => (
          <RaceRow
            key={r.id}
            rank={i + 1}
            lead={<Avatar id={r.id} name={r.name} size={34} you={r.isYou} />}
            name={r.isYou ? 'You' : r.name}
            strong={r.isYou}
            demo={r.isDemo}
            points={r.points}
            max={max}
            fill={r.isYou ? colors.yellow : colors.ink}
            detail={boardDetail(r)}
            onPress={r.isYou ? undefined : () => router.push({ pathname: '/friend/[id]', params: { id: r.id } })}
          />
        ))}
      </View>

      {beyond.length > 0 && (
        <View style={{ gap: 4 }}>
          <SectionTitle title="Beyond your friends" note="Average points today" />
          <View style={{ marginTop: 4 }}>
            {beyond.map((b, i) => (
              <RaceRow
                key={b.label}
                name={b.label.replace(/( players)?, average$/, '')}
                points={b.points}
                max={max}
                fill={BEYOND_FILLS[i] ?? colors.teal}
                onPress={() => router.push({ pathname: '/area/[scope]', params: { scope: b.scope } })}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** Only the exceptions: a full day of ballots needs no note. */
function boardDetail(r: BoardRow) {
  if (!r.playedToday) return r.streak > 0 ? `${r.streak}-day streak at risk` : 'Not played yet';
  return r.games < 3 ? `${r.games} of 3 ballots` : undefined;
}

const RANK_W = 18;
// City, state, then everyone: the app's local, state and national colors.
const BEYOND_FILLS = [levelColor.local, levelColor.state, levelColor.federal];

/** One lane of today's race: the bar's length is points against the day's best score. */
function RaceRow(props: {
  rank?: number;
  lead?: ReactNode;
  name: string;
  strong?: boolean;
  demo?: boolean;
  points: number | null;
  max: number;
  fill: string;
  detail?: string;
  /** Opens the friend's page; left off for your own row and the averages. */
  onPress?: () => void;
}) {
  const { rank, lead, name, strong, demo, points, max, fill, detail, onPress } = props;
  const pct = points ? Math.max(2, Math.round((points / max) * 100)) : 0;
  return (
    <Pressable
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${rank ? `${ordinalOf(rank)}, ` : ''}${name}: ${points ?? 'no'} points${detail ? `. ${detail}` : ''}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        opacity: pressed ? 0.6 : 1,
      })}>
      {rank ? (
        <Text style={{ width: RANK_W, fontFamily: fonts.serif800, fontSize: 18, color: strong || rank === 1 ? colors.ink : colors.meta }}>
          {rank}
        </Text>
      ) : null}
      {lead}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ flexShrink: 1, fontSize: 16, fontWeight: strong ? '800' : '600' }} numberOfLines={1}>
            {name}
          </Text>
          {demo && <DemoTag />}
          {detail ? (
            <Text style={{ flexShrink: 1, fontSize: 12, color: colors.meta }} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
          <Text style={{ marginLeft: 'auto', fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{points ?? '–'}</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted }}>
          {pct > 0 && (
            <View
              style={{
                width: `${pct}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: fill,
                borderWidth: strong ? 1 : 0,
              }}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function FriendList({ data, onRespond }: { data: FriendsData; onRespond: (id: string, a: 'accept' | 'ignore') => void }) {
  return (
    <View style={{ gap: 28 }}>
      {data.requests.length > 0 && (
        <View style={{ gap: 4 }}>
          <SectionTitle title={`${data.requests.length} friend ${data.requests.length === 1 ? 'request' : 'requests'}`} />
          <View style={{ marginTop: 6 }}>
            {data.requests.map((r) => (
              <View
                key={r.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.hairline,
                }}>
                <Avatar id={r.from.id} name={r.from.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{r.from.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.meta }}>{requestSource(r.source)}</Text>
                </View>
                <SmallPill label="Ignore" onPress={() => onRespond(r.id, 'ignore')} />
                <SmallPill label="Accept" filled onPress={() => onRespond(r.id, 'accept')} />
              </View>
            ))}
          </View>
        </View>
      )}

      {data.friends.length === 0 ? (
        <Empty title="No friends yet" body="Send your invite link or have a friend scan your QR code." />
      ) : (
        <View style={{ gap: 4 }}>
          <SectionTitle
            title={`${data.friends.length} ${data.friends.length === 1 ? 'friend' : 'friends'}`}
            note="How often you voted the same way"
          />
          <View style={{ marginTop: 6 }}>
            {data.friends.map((f) => (
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
                  borderTopWidth: 1,
                  borderTopColor: colors.hairline,
                  opacity: pressed ? 0.6 : 1,
                })}>
                <Avatar id={f.id} name={f.name} size={42} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ flexShrink: 1, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                      {f.name}
                    </Text>
                    {f.isDemo && <DemoTag />}
                    <Text style={{ marginLeft: 'auto', fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                      {f.agreementPct === null ? '–' : `${f.agreementPct}%`}
                    </Text>
                  </View>
                  {f.agreementPct !== null && (
                    // Teal for agreed on the same light grey track as the Leaderboard bars.
                    <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ flex: f.agreementPct, backgroundColor: colors.teal }} />
                      <View style={{ flex: 100 - f.agreementPct, backgroundColor: colors.muted }} />
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: colors.meta }}>
                    {f.agreementPct === null
                      ? 'Play more days to compare'
                      : `${f.sharedBills} ${f.sharedBills === 1 ? 'bill' : 'bills'} in common`}
                  </Text>
                </View>
                <ChevronRight size={14} color={colors.meta} />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <Legend color={colors.teal} label="Same vote" />
            <Legend color={colors.muted} label="Different vote" />
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
