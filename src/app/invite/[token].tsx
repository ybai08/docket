import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PillButton } from '@/components/pill-button';
import { api } from '@/lib/api';
import { formatDayLong } from '@/lib/day';
import type { DailyAgreement } from '@/lib/social';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

type Accepted = { inviter: { id: string; name: string }; alreadyFriends: boolean; today: DailyAgreement };

/** What an invited friend sees: they're friends right away (with Undo), then today's comparison. */
export default function InviteLanding() {
  const { token, via } = useLocalSearchParams<{ token: string; via?: string }>();
  const { day, status } = useToday();
  const [result, setResult] = useState<Accepted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    api<Accepted>(`/invites/${token}/accept`, { method: 'POST', body: { via: via === 'qr' ? 'qr' : 'link' } })
      .then(setResult)
      .catch((err: Error) => setError(err.message));
  }, [token, via]);

  async function undo() {
    setUndone(true);
    await api(`/invites/${token}/undo`, { method: 'POST' }).catch(() => setUndone(false));
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <Text style={type.title}>{error}</Text>
        <PillButton label="Go to Today" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  if (!result) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ink} />
      </SafeAreaView>
    );
  }

  const name = result.inviter.name;
  const today = result.today;
  const played = status.rollCall.state === 'done';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, gap: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fonts.serif800, fontSize: 24, letterSpacing: -0.4 }}>Docket</Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 4,
              paddingLeft: 4,
              paddingRight: 12,
              borderRadius: 999,
              backgroundColor: colors.muted,
            }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.ground, fontSize: 13, fontWeight: '700' }}>{name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>{name} invited you</Text>
          </View>
        </View>

        <View style={{ gap: 14, paddingTop: 12 }}>
          <Text style={{ fontSize: 15, color: colors.text2 }}>{`Today's Roll Call, ${formatDayLong(day).split(', ')[1]}`}</Text>
          {today.played && today.agreed !== null ? (
            <>
              <Text style={{ fontFamily: fonts.serif700, fontSize: 40, lineHeight: 44, letterSpacing: -0.5 }} accessibilityRole="header">
                You and {name} agreed on {today.agreed} of {today.total} bills
              </Text>
              <View
                style={{ flexDirection: 'row', gap: 6 }}
                accessible
                accessibilityLabel={`${today.agreed} agreed, ${today.total - today.agreed} split`}>
                {Array.from({ length: today.total }, (_, i) => (
                  <View
                    key={i}
                    style={{ flex: 1, height: 40, borderRadius: 8, borderWidth: 2, backgroundColor: i < today.agreed! ? colors.teal : colors.lavender }}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Legend color={colors.teal} label={`${today.agreed} agreed`} />
                <Legend color={colors.lavender} label={`${today.total - today.agreed} split`} />
              </View>
              <Text style={{ padding: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.muted, fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                Which bills you split on stays private unless you both turn on vote sharing.
              </Text>
            </>
          ) : (
            <>
              <Text style={{ fontFamily: fonts.serif700, fontSize: 36, lineHeight: 40, letterSpacing: -0.5 }} accessibilityRole="header">
                {played ? 'Play more days to compare' : `Play today's Roll Call to see where you and ${name} agree`}
              </Text>
              {played && (
                <Text style={{ fontSize: 14, lineHeight: 19, color: colors.text2 }}>
                  {`Once you've both voted on enough of the same bills, your agreement shows up here and on ${name}'s profile.`}
                </Text>
              )}
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>
              {undone ? `You and ${name} aren't friends` : `You and ${name} are friends`}
            </Text>
            <Text style={{ fontSize: 13, color: colors.text2 }}>
              {undone ? 'Undone. Nothing was shared.' : `Added from ${name}'s ${via === 'qr' ? 'QR code' : 'invite link'}`}
            </Text>
          </View>
          {!undone && !result.alreadyFriends && (
            <Pressable accessibilityRole="button" onPress={undo} hitSlop={10}>
              <Text style={{ fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' }}>Undo</Text>
            </Pressable>
          )}
        </View>

        <View style={{ flex: 1 }} />
        <PillButton
          label={played ? 'Back to Today' : 'Play Roll Call'}
          onPress={() => (played ? router.replace('/') : router.replace('/roll-call'))}
        />
      </View>
    </SafeAreaView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, backgroundColor: color }} />
      <Text style={{ fontSize: 13 }}>{label}</Text>
    </View>
  );
}
