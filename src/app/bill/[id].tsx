import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillChip } from '@/components/bill-chip';
import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { BILLS } from '@/data/bills';
import type { ChamberVote, Vote } from '@/data/types';
import { agreed } from '@/lib/scoring';
import { useRemote } from '@/lib/social';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

type MemberVote = { name: string; label: string; vote: string };

/** One bill in full: what it does, how it ended, every chamber's vote, and how you and your lawmakers voted. */
export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { set, progress } = useToday();
  const bill = BILLS[id] ?? set.rollCall.find((b) => b.id === id);
  const yours = progress.rollCall.votes[id] as Vote | undefined;
  const { data } = useRemote<{ byBill: Record<string, MemberVote[]> } & Record<'federal' | 'state' | 'local', { id: string; name: string }[]>>(
    '/me/lawmakers',
  );
  const members = data?.byBill[id] ?? [];
  // byBill names each lawmaker but carries no id; find it among your lawmakers to link their page.
  const lawmakerId = (name: string) => (data ? [...data.federal, ...data.state, ...data.local].find((r) => r.name === name)?.id : undefined);

  if (!bill) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
        <ScreenHeader title="Bill" />
        <Text style={[type.meta, { padding: 24 }]}>{"We don't have the details for this bill."}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title={bill.number} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 30 }}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <BillChip number={bill.number} level={bill.level} />
            <Text style={type.meta}>{bill.origin}</Text>
          </View>
          <Text style={type.billTitle} accessibilityRole="header">
            {bill.title}
          </Text>
          <Text style={type.bodyLg}>{bill.summary}</Text>
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.muted }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text2 }}>{bill.topic}</Text>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>Outcome</Text>
          <Text style={{ fontFamily: fonts.serif800, fontSize: 30, lineHeight: 34 }}>{bill.outcome}</Text>
          <Text style={{ fontSize: 15, color: colors.text2 }}>
            {bill.passed ? 'Lawmakers passed it.' : 'Lawmakers did not pass it.'}
          </Text>
        </View>

        <Section title="The votes" note="Each chamber's final recorded vote">
          <View style={{ gap: 18 }}>
            {bill.chamberVotes.map((c) => (
              <ChamberBar key={c.chamber} vote={c} />
            ))}
          </View>
        </Section>

        {yours && (
          <Section title="Your vote">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <VoteBadge vote={yours} />
              <Text style={{ flex: 1, fontSize: 15, color: colors.text2 }}>
                {agreed(bill, yours) ? 'You voted with the final result.' : 'You voted against the final result.'}
              </Text>
            </View>
          </Section>
        )}

        {members.length > 0 && (
          <Section title="Your lawmakers" note="How the people who represent you voted">
            <View>
              {members.map((m, i) => {
                const lid = lawmakerId(m.name);
                return (
                  <Pressable
                    key={m.name}
                    accessible
                    accessibilityLabel={`${m.label}, ${m.name}: ${m.vote === 'yea' ? 'Yea' : 'Nay'}`}
                    accessibilityHint={lid ? 'Opens their page' : undefined}
                    disabled={!lid}
                    onPress={() => lid && router.push({ pathname: '/lawmaker/[id]', params: { id: lid } })}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 11,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: colors.hairline,
                      opacity: pressed ? 0.6 : 1,
                    })}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600' }}>{m.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.meta }}>{m.label}</Text>
                    </View>
                    <VoteBadge vote={m.vote === 'yea' ? 'yea' : 'nay'} />
                  </Pressable>
                );
              })}
            </View>
          </Section>
        )}

        <PillButton label="Read the bill" variant="outline" style={{ alignSelf: 'stretch', height: 50 }} onPress={() => Linking.openURL(bill.sourceUrl)} />
      </ScrollView>
    </SafeAreaView>
  );
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

/** A chamber's Yea and Nay as one bar: teal for Yea, lavender for Nay, like the vote badges. */
function ChamberBar({ vote: c }: { vote: ChamberVote }) {
  const yeas = c.yeas ?? 0;
  const nays = c.nays ?? 0;
  return (
    <View
      style={{ gap: 6 }}
      accessible
      accessibilityLabel={c.consent ? `${c.chamber}: passed by unanimous consent` : `${c.chamber}: ${yeas} Yea, ${nays} Nay`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>{c.chamber}</Text>
        <Text style={{ fontSize: 13, color: colors.text2, fontVariant: ['tabular-nums'] }}>
          {c.consent ? (
            'Unanimous consent, no recorded count'
          ) : (
            <>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{yeas}</Text> Yea{'   '}
              <Text style={{ fontWeight: '800', color: colors.ink }}>{nays}</Text> Nay
            </>
          )}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.muted }}>
        <View style={{ flex: c.consent ? 1 : yeas, backgroundColor: colors.teal }} />
        {!c.consent && <View style={{ flex: nays, backgroundColor: colors.lavender }} />}
      </View>
    </View>
  );
}

function VoteBadge({ vote }: { vote: Vote }) {
  return (
    <View
      style={{
        width: 56,
        height: 28,
        borderRadius: 14,
        backgroundColor: vote === 'yea' ? colors.teal : colors.lavender,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: 13, fontWeight: '800' }}>{vote === 'yea' ? 'Yea' : 'Nay'}</Text>
    </View>
  );
}
