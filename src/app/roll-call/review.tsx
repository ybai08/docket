import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillChip } from '@/components/bill-chip';
import { ScreenHeader } from '@/components/screen-header';
import { VoteSlider } from '@/components/vote-slider';
import { agreed } from '@/lib/scoring';
import { useRemote } from '@/lib/social';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

/** Each bill in full after voting: summary, outcome, every chamber's vote and the source. */
export default function ReviewBills() {
  const { set, progress } = useToday();
  const votes = progress.rollCall.votes;
  const { data } = useRemote<{ byBill: Record<string, { name: string; label: string; vote: string }[]> }>('/me/lawmakers');
  const byBill = data?.byBill ?? {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title="Review" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 }}>
        {set.rollCall.map((b) => {
          const vote = votes[b.id];
          return (
            <Pressable
              key={b.id}
              accessibilityHint="Opens the bill"
              onPress={() => router.push({ pathname: '/bill/[id]', params: { id: b.id } })}
              style={({ pressed }) => ({ gap: 10, padding: 18, borderRadius: 14, borderWidth: 2, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <BillChip number={b.number} level={b.level} />
                <Text style={type.meta}>{b.origin}</Text>
              </View>
              <Text style={{ fontFamily: fonts.serif700, fontSize: 22, lineHeight: 26 }}>{b.title}</Text>
              <Text style={[type.body, { lineHeight: 21, color: colors.text2 }]}>{b.summary}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.text2 }}>
                  {vote ? (
                    <>
                      You voted <Text style={{ fontWeight: '700', color: colors.ink }}>{vote === 'yea' ? 'Yea' : 'Nay'}</Text>
                      {agreed(b, vote) ? ', with the final vote' : ', against the final vote'}
                    </>
                  ) : (
                    'Not voted'
                  )}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700' }}>{b.outcome}</Text>
              </View>
              {b.chamberVotes.map((c) => (
                <VoteSlider key={c.chamber} chamber={c.chamber} yeas={c.yeas} nays={c.nays} consent={c.consent} />
              ))}
              {(byBill[b.id] ?? []).length ? (
                <View style={{ gap: 2 }}>
                  {byBill[b.id].map((m) => (
                    <Text key={m.name} style={{ fontSize: 13, color: colors.text2 }}>
                      {m.label}, {m.name}: <Text style={{ fontWeight: '700', color: colors.ink }}>{m.vote === 'yea' ? 'Yea' : 'Nay'}</Text>
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={type.meta}>
                  {b.level === 'state' ? "Your lawmakers' votes: [placeholder]" : b.chamberVotes.some((c) => c.consent) ? 'Passed the Senate by unanimous consent, with no recorded votes' : ''}
                </Text>
              )}
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(b.sourceUrl)} hitSlop={8}>
                <Text style={{ fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' }}>Read the bill</Text>
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
