import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillChip } from '@/components/bill-chip';
import { ChevronRight } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { BILLS } from '@/data/bills';
import type { Vote } from '@/data/types';
import { useRemote } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

type Sourced<T> = T & { sourceName: string; sourceUrl: string };
type Lawmaker = {
  id: string;
  name: string;
  title: string;
  role: string;
  state: string;
  stateName: string;
  district: string | null;
  /** Null until you have voted on one of their bills. */
  party: string | null;
  photo: string | null;
  photoCredit: string | null;
  inOfficeSince: string | null;
  background: Sourced<{ text: string }> | null;
  priorities: Sourced<{ items: string[] }> | null;
  committees: Sourced<{ items: string[] }> | null;
  links: { label: string; url: string }[];
  votes: { billId: string; vote: Vote; sourceUrl: string }[];
  agreement: { pct: number | null; agreed: number; shared: number };
};

const PARTY: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };

/** One lawmaker: who they are, where that comes from, how often you agree, and how they voted on Docket's bills. */
export default function LawmakerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // State lawmaker ids contain a slash ("ocd-person/…"), so encode it to keep one path segment.
  const { data: l, error, reload } = useRemote<Lawmaker>(`/lawmakers/${encodeURIComponent(id)}`);

  if (!l) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
        <ScreenHeader title="Lawmaker" />
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

  // Only bills the app knows can be shown and opened.
  const votes = l.votes.filter((v) => BILLS[v.billId]);
  const { pct, agreed, shared } = l.agreement;
  const facts = [l.party ? (PARTY[l.party] ?? l.party) : null, l.inOfficeSince ? `In office since ${l.inOfficeSince}` : null].filter(Boolean);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title="Lawmaker" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Portrait name={l.name} photo={l.photo} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.serif800, fontSize: 28, lineHeight: 31, letterSpacing: -0.3 }} accessibilityRole="header">
              {l.name}
            </Text>
            <Text style={{ fontSize: 15, color: colors.text2 }}>{l.role}</Text>
            <Text style={{ fontSize: 13, color: colors.meta }}>
              {facts.length ? facts.join(' · ') : 'Party shows after you vote on one of their bills'}
            </Text>
          </View>
        </View>

        {l.background && (
          <Section title="Background">
            <Text style={{ fontSize: 16, lineHeight: 23, color: colors.text2 }}>{l.background.text}</Text>
            <Credit source={l.background} />
          </Section>
        )}

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>How often you agree</Text>
          {pct != null ? (
            <>
              <Text style={{ fontFamily: fonts.serif800, fontSize: 44, lineHeight: 48 }}>{pct}%</Text>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: 8, backgroundColor: colors.teal }} />
              </View>
              <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>
                {`You voted the same way on ${agreed} of the ${shared} ${shared === 1 ? 'bill' : 'bills'} you've both voted on.`}
              </Text>
            </>
          ) : (
            <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>
              {votes.length ? 'Vote on their bills in Roll Call to see how often you agree.' : "We don't have their votes on Docket's bills yet."}
            </Text>
          )}
        </View>

        {votes.length > 0 && (
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
        )}

        {l.priorities && l.priorities.items.length > 0 && (
          <Section title="Priorities">
            <Bullets items={l.priorities.items} />
            <Credit source={l.priorities} />
          </Section>
        )}

        {l.committees && l.committees.items.length > 0 && (
          <Section title="Committees">
            <Bullets items={l.committees.items} />
            <Credit source={l.committees} />
          </Section>
        )}

        {l.links.length > 0 && (
          <Section title="Learn more">
            <View>
              {l.links.map((k, i) => (
                <Pressable
                  key={k.url}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(k.url)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 14,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.hairline,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{k.label}</Text>
                  <ChevronRight size={14} color={colors.meta} />
                </Pressable>
              ))}
            </View>
          </Section>
        )}

        {l.photoCredit ? <Text style={{ fontSize: 11, color: colors.meta }}>Photo: {l.photoCredit}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Portrait({ name, photo }: { name: string; photo: string | null }) {
  const initials = name
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
      {photo ? (
        <Image
          source={{ uri: photo }}
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

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink, marginTop: 8 }} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** Where a block came from, linked; Wikipedia's name carries its CC BY-SA credit. */
function Credit({ source }: { source: { sourceName: string; sourceUrl: string } }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(source.sourceUrl)} hitSlop={8}>
      <Text style={{ fontSize: 12, color: colors.meta }}>
        Source: <Text style={{ textDecorationLine: 'underline' }}>{source.sourceName}</Text>
      </Text>
    </Pressable>
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
