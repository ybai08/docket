import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronRight } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { useBills } from '@/components/use-bills';
import type { Bill } from '@/data/types';
import { formatDayLong } from '@/lib/day';
import { useRemote, type AreaBreakdown } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

/** How everyone in your city, your state or all of Docket did today, next to your own score. */
export default function AreaScreen() {
  const { scope } = useLocalSearchParams<{ scope: string }>();
  const { data: a, error, reload } = useRemote<AreaBreakdown>(`/leaderboard/area/${scope}`);
  const bills = useBills(a?.bills.map((b) => b.billId) ?? []);

  if (!a) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
        <ScreenHeader title="Today" />
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
      </SafeAreaView>
    );
  }

  const enough = a.players >= a.minPlayers;
  const played = a.you.rank != null || a.you.points > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title={a.label} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 30 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>
            {a.label}, {formatDayLong(a.day)}
          </Text>
          <Text style={{ fontFamily: fonts.serif800, fontSize: 30, lineHeight: 34 }}>
            {a.players} {a.players === 1 ? 'player' : 'players'} today
          </Text>
          {!enough && (
            <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>
              {`Scores show once ${a.minPlayers} people here have played, so no one's score can be picked out.`}
            </Text>
          )}
        </View>

        {enough && (
          <View style={{ flexDirection: 'row' }}>
            <Figure value={a.avgPoints} label="Average points" />
            <Figure value={a.topPoints} label="Top score" divider />
            <Figure value={a.you.points} label="Your points" divider strong />
          </View>
        )}

        {enough && a.distribution.length > 0 && (
          <Section
            title="How scores spread"
            note={
              a.you.percentile != null
                ? `You beat ${a.you.percentile}% of players${a.you.rank ? `, ranking ${ordinal(a.you.rank)} of ${a.players}` : ''}.`
                : played
                  ? 'Your rank shows once more people play.'
                  : 'Play today to see where you land.'
            }>
            <Histogram buckets={a.distribution} yours={played ? a.you.points : null} />
          </Section>
        )}

        <Section title="By game" note="Average for players here who finished each game">
          <View>
            <GameLine
              name="Roll Call"
              players={a.byGame.rollCall.players}
              value={a.byGame.rollCall.avgAgreedPct != null ? `${a.byGame.rollCall.avgAgreedPct}%` : null}
              caption="agreed with the final vote"
              first
            />
            <GameLine
              name="Filed or Fake"
              players={a.byGame.filedOrFake.players}
              value={a.byGame.filedOrFake.avgCorrect != null ? `${a.byGame.filedOrFake.avgCorrect}/${a.byGame.filedOrFake.outOf}` : null}
              caption="spotted correctly"
            />
            <GameLine
              name="Landslide"
              players={a.byGame.landslide.players}
              value={a.byGame.landslide.avgPoints != null ? `${a.byGame.landslide.avgPoints}/${a.byGame.landslide.outOf}` : null}
              caption="points"
            />
          </View>
        </Section>

        {a.bills.length > 0 && (
          <Section title={`How ${a.label} voted`} note="On today's Roll Call bills">
            <View>
              {a.bills.map((b, i) => (
                <BillSplit key={b.billId} bill={b} known={bills.get(b.billId)} first={i === 0} />
              ))}
              <View style={{ flexDirection: 'row', gap: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                <Swatch color={colors.teal} label="Yea" />
                <Swatch color={colors.lavender} label="Nay" />
              </View>
            </View>
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
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

function Figure({ value, label, divider, strong }: { value: number | null; label: string; divider?: boolean; strong?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2, paddingLeft: divider ? 14 : 0, borderLeftWidth: divider ? 1 : 0, borderLeftColor: colors.hairline }}>
      <Text style={{ fontSize: 30, lineHeight: 34, fontWeight: strong ? '700' : '400', fontVariant: ['tabular-nums'] }}>{value ?? '–'}</Text>
      <Text style={{ fontSize: 12, lineHeight: 15, color: colors.text2 }}>{label}</Text>
    </View>
  );
}

/** Six score buckets as columns; yours is yellow. */
function Histogram({ buckets, yours }: { buckets: AreaBreakdown['distribution']; yours: number | null }) {
  const most = Math.max(1, ...buckets.map((b) => b.count));
  const mine = yours == null ? -1 : buckets.findIndex((b, i) => yours >= b.min && (yours <= b.max || i === buckets.length - 1));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
        {buckets.map((b, i) => (
          <View
            key={b.min}
            accessible
            accessibilityLabel={`${b.min} to ${b.max} points: ${b.count} ${b.count === 1 ? 'player' : 'players'}${i === mine ? ', including you' : ''}`}
            style={{ flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.meta, fontVariant: ['tabular-nums'] }}>{b.count}</Text>
            <View
              style={{
                width: '100%',
                height: `${Math.max(3, (b.count / most) * 80)}%`,
                borderRadius: 4,
                backgroundColor: i === mine ? colors.yellow : colors.ink,
                borderWidth: i === mine ? 1.5 : 0,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {buckets.map((b) => (
          <Text key={b.min} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: colors.meta, fontVariant: ['tabular-nums'] }}>
            {b.min === b.max ? b.min : `${b.min}–${b.max}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

function GameLine({ name, players, value, caption, first }: { name: string; players: number; value: string | null; caption: string; first?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.hairline,
      }}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>{name}</Text>
        <Text style={{ fontSize: 12, color: colors.meta }}>
          {value != null ? `${players} ${players === 1 ? 'player' : 'players'}, ${caption}` : 'Not enough players yet'}
        </Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value ?? '–'}</Text>
    </View>
  );
}

/** One bill's Yea/Nay split in this area, hidden below the privacy threshold. Opens the bill. */
function BillSplit({ bill: b, known, first }: { bill: AreaBreakdown['bills'][number]; known?: Bill; first: boolean }) {
  return (
    <Pressable
      accessibilityRole={known ? 'button' : undefined}
      accessibilityLabel={`${known?.shortTitle ?? b.billId}: ${b.yeaPct != null ? `${b.yeaPct}% Yea` : 'hidden'}, ${b.voters} voted`}
      disabled={!known}
      onPress={() => router.push({ pathname: '/bill/[id]', params: { id: b.billId } })}
      style={({ pressed }) => ({
        gap: 6,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.hairline,
        opacity: pressed ? 0.6 : 1,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>
          {known?.shortTitle ?? b.billId}
        </Text>
        <Text style={{ fontSize: 12, color: colors.meta }}>{b.voters} voted</Text>
        {known && <ChevronRight size={14} color={colors.meta} />}
      </View>
      {b.yeaPct != null ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ flex: b.yeaPct, backgroundColor: colors.teal }} />
            <View style={{ flex: 100 - b.yeaPct, backgroundColor: colors.lavender }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{b.yeaPct}% Yea</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{100 - b.yeaPct}% Nay</Text>
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: colors.meta }}>
          {"Hidden so no one's vote can be guessed"}
        </Text>
      )}
    </Pressable>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: colors.text2 }}>{label}</Text>
    </View>
  );
}
