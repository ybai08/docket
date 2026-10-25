import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillChip } from '@/components/bill-chip';
import { ChevronRight } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { BILLS } from '@/data/bills';
import type { Vote } from '@/data/types';
import { useRemote } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

type Row = {
  id: string;
  name: string;
  role: string;
  party?: string | null;
  photo?: string | null;
  credit?: string | null;
  recorded?: number;
  shared?: number;
  agreed?: number;
  pct?: number | null;
};
type MemberVote = { name: string; label: string; vote: string };
type Data = { federal: Row[]; state: Row[]; local: Row[]; byBill: Record<string, MemberVote[]> };

const PARTY: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };

/** One of your lawmakers: who they are, how often you agree, and how they voted on Docket's bills. */
export default function LawmakerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The same list Profile loads; this screen only covers the lawmakers who represent you.
  const { data, loading } = useRemote<Data>('/me/lawmakers');
  const row = data ? [...data.federal, ...data.state, ...data.local].find((r) => r.id === id) : undefined;

  if (!row) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
        <ScreenHeader title="Lawmaker" />
        {loading || !data ? (
          <ActivityIndicator color={colors.ink} style={{ marginTop: 24 }} />
        ) : (
          <Text style={[type.meta, { padding: 24 }]}>{"We couldn't find this lawmaker."}</Text>
        )}
      </SafeAreaView>
    );
  }

  // byBill lists your lawmakers' votes by bill, by name; keep this lawmaker's, in the app's bill order.
  const votes = Object.keys(BILLS)
    .map((billId) => ({ billId, vote: data!.byBill[billId]?.find((m) => m.name === row.name)?.vote }))
    .filter((v): v is { billId: string; vote: Vote } => v.vote === 'yea' || v.vote === 'nay');
  const shared = row.shared ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title="Lawmaker" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Portrait row={row} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.serif800, fontSize: 28, lineHeight: 31, letterSpacing: -0.3 }} accessibilityRole="header">
              {row.name}
            </Text>
            <Text style={{ fontSize: 15, color: colors.text2 }}>{row.role}</Text>
            <Text style={{ fontSize: 13, color: colors.meta }}>
              {row.party ? (PARTY[row.party] ?? row.party) : 'Party shows after you vote on one of their bills'}
            </Text>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>How often you agree</Text>
          {row.pct != null ? (
            <>
              <Text style={{ fontFamily: fonts.serif800, fontSize: 44, lineHeight: 48 }}>{row.pct}%</Text>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' }}>
                <View style={{ width: `${row.pct}%`, height: 8, backgroundColor: colors.teal }} />
              </View>
              <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>
                {`You voted the same way on ${row.agreed ?? 0} of the ${shared} ${shared === 1 ? 'bill' : 'bills'} you've both voted on.`}
              </Text>
            </>
          ) : (
            <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>
              {row.recorded ? 'Vote on their bills in Roll Call to see how often you agree.' : "We don't have their votes on Docket's bills yet."}
            </Text>
          )}
        </View>

        {votes.length > 0 ? (
          <Section title="How they voted" note="Their recorded votes on Docket's bills">
            <View>
              {votes.map((v, i) => {
                const bill = BILLS[v.billId];
                return (
                  <Pressable
                    key={v.billId}
                    accessibilityRole="button"
                    accessibilityLabel={`${bill.shortTitle}, ${bill.number}: ${v.vote === 'yea' ? 'Yea' : 'Nay'}`}
                    accessibilityHint="Opens the bill"
                    onPress={() => router.push({ pathname: '/bill/[id]', params: { id: v.billId } })}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: colors.hairline,
                      opacity: pressed ? 0.6 : 1,
                    })}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600' }}>{bill.shortTitle}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <BillChip number={bill.number} level={bill.level} size="sm" />
                        <Text style={{ fontSize: 12, color: colors.meta }}>{bill.outcome}</Text>
                      </View>
                    </View>
                    <VoteBadge vote={v.vote} />
                    <ChevronRight size={14} color={colors.meta} />
                  </Pressable>
                );
              })}
            </View>
          </Section>
        ) : row.recorded ? (
          <Text style={type.meta}>{`They have recorded votes on ${row.recorded} of Docket's bills.`}</Text>
        ) : null}

        {row.credit ? <Text style={{ fontSize: 11, color: colors.meta }}>{row.credit}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Portrait({ row }: { row: Row }) {
  const initials = row.name
    .replace(/"[^"]*"/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('');
  return (
    <View
      style={{
        width: 88,
        height: 88,
        borderRadius: 44,
        overflow: 'hidden',
        borderWidth: 2,
        backgroundColor: colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text2 }}>{initials}</Text>
      {row.photo ? (
        <Image
          source={{ uri: row.photo }}
          accessibilityIgnoresInvertColors
          contentFit="cover"
          contentPosition="top"
          transition={150}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
    </View>
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
