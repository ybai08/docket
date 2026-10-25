import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillChip } from '@/components/bill-chip';
import { ChevronRight } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { VoteSlider } from '@/components/vote-slider';
import type { Bill, Vote } from '@/data/types';
import { formatCountdown, msUntilNextDay } from '@/lib/day';
import { agreed } from '@/lib/scoring';
import { shareText } from '@/lib/share';
import { useRemote, type DailyAgreement } from '@/lib/social';
import { useToday } from '@/lib/use-today';
import { colors, type } from '@/theme';

export default function RollCallResultsScreen() {
  const { day, set, progress, status, stats, actions } = useToday();
  const votes = progress.rollCall.votes;
  const complete = set.rollCall.every((b) => votes[b.id]);
  const results = set.rollCall.map((b) => (votes[b.id] ? agreed(b, votes[b.id]) : false));
  const agreedCount = results.filter(Boolean).length;

  // Seeing results makes today's ballot final.
  const revealed = progress.rollCall.revealed;
  const { revealRollCall } = actions;
  useEffect(() => {
    if (complete && !revealed) revealRollCall();
  }, [complete, revealed, revealRollCall]);

  if (!complete) return <Redirect href="/roll-call" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title="Roll Call" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 20 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <Text style={[type.billTitle, { textAlign: 'center', paddingHorizontal: 12, letterSpacing: 0 }]} accessibilityRole="header">
            You agreed with the final vote on {agreedCount} of {set.rollCall.length}
          </Text>
          <View
            style={{ flexDirection: 'row', gap: 6 }}
            accessible
            accessibilityLabel={results.map((r) => (r ? 'Agreed' : 'Disagreed')).join(', ')}>
            {results.map((r, i) => (
              <View
                key={i}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  borderWidth: 2,
                  backgroundColor: r ? colors.teal : colors.lavender,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Legend color={colors.teal} label="Agreed" />
            <Legend color={colors.lavender} label="Disagreed" />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={[type.section, { marginBottom: 4 }]} accessibilityRole="header">
            How lawmakers voted
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 100, paddingRight: 138 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text2 }}>All Nay</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text2 }}>All Yea</Text>
          </View>
          {set.rollCall.map((b) => (
            <BillResult key={b.id} bill={b} vote={votes[b.id]} />
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={type.section} accessibilityRole="header">
            Statistics
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Stat value={stats.rollCallsPlayed} label="Played" />
            <Stat value={stats.agreementPct} label="Agreement %" />
            <Stat value={stats.currentStreak} label="Current streak" />
            <Stat value={stats.maxStreak} label="Max streak" />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={type.section} accessibilityRole="header">
            Agreement with friends today
          </Text>
          <FriendsToday />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/roll-call/review')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderWidth: 1.5,
            borderRadius: 12,
            opacity: pressed ? 0.7 : 1,
          })}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>Review the {set.rollCall.length} bills</Text>
            <Text style={type.meta}>{"Outcomes, your rep's votes, the arguments"}</Text>
          </View>
          <ChevronRight />
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 16 }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 2, borderRightWidth: 1, borderRightColor: colors.hairline }}>
            <Text style={{ fontSize: 12, fontWeight: '700' }}>Next Roll Call</Text>
            <Countdown />
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <PillButton
              label="Share"
              style={{ height: 48, paddingHorizontal: 26 }}
              onPress={() => Share.share({ message: shareText(day, set, progress, status) })}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Each friend's "X of 5" today. The server hides X when it's 0 or 5, since that would reveal every vote.
function FriendsToday() {
  const { data } = useRemote<{ friends: (DailyAgreement & { id: string; name: string })[] }>('/friends/today');
  const rows = data?.friends ?? [];
  if (!rows.length) return <Text style={type.meta}>Add friends to compare. Their results show here once they play.</Text>;
  const sorted = [...rows].sort((a, b) => ((b.played && b.agreed) || 0) - ((a.played && a.agreed) || 0));
  return (
    <>
      {sorted.map((f, i) => {
        const agreed = f.played ? f.agreed : null;
        const total = f.played ? f.total : 5;
        return (
          <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ width: 64, fontSize: 14 }} numberOfLines={1}>
              {f.name}
            </Text>
            {agreed === null ? (
              <Text style={[type.meta, { flex: 1 }]}>Play more days to compare</Text>
            ) : (
              <View style={{ flex: 1, height: 24 }}>
                <View
                  accessible
                  accessibilityLabel={`${f.name}: agreed on ${agreed} of ${total}`}
                  style={{
                    width: `${(agreed / total) * 100}%`,
                    minWidth: 28,
                    height: 24,
                    backgroundColor: i === 0 ? colors.teal : colors.tabInactive,
                    borderWidth: i === 0 ? 1.5 : 0,
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingRight: 8,
                  }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: i === 0 ? colors.ink : colors.ground }}>{agreed}</Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, backgroundColor: color }} />
      <Text style={{ fontSize: 13, color: colors.text2 }}>{label}</Text>
    </View>
  );
}

function BillResult({ bill, vote }: { bill: Bill; vote: Vote }) {
  const ok = agreed(bill, vote);
  return (
    <View style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <BillChip number={bill.number} level={bill.level} size="sm" />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700' }}>{bill.shortTitle}</Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            borderWidth: 1.5,
            backgroundColor: ok ? colors.teal : colors.lavender,
          }}>
          <Text style={{ fontSize: 11, fontWeight: '800' }}>{ok ? 'Agreed' : 'Disagreed'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: colors.text2 }}>
          You voted <Text style={{ fontWeight: '700', color: colors.ink }}>{vote === 'yea' ? 'Yea' : 'Nay'}</Text>
        </Text>
        <Text style={{ fontSize: 12, color: colors.text2 }}>{bill.outcome}</Text>
      </View>
      {bill.chamberVotes.map((c) => (
        <VoteSlider key={c.chamber} chamber={c.chamber} yeas={c.yeas} nays={c.nays} consent={c.consent} />
      ))}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={type.stat}>{value}</Text>
      <Text style={{ fontSize: 12, lineHeight: 15, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function Countdown() {
  const [ms, setMs] = useState(msUntilNextDay);
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilNextDay()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text style={{ fontSize: 26, fontVariant: ['tabular-nums'] }} accessibilityLabel={`Next Roll Call in ${formatCountdown(ms)}`}>
      {formatCountdown(ms)}
    </Text>
  );
}
