import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { api } from '@/lib/api';
import { requestSource } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

/**
 * Someone you aren't friends with yet, opened from their friend request. The server shares nothing
 * about non-friends, so this shows only what the request carries until you accept.
 */
export default function PersonScreen() {
  const { id, name = 'Docket player', source, requestId } = useLocalSearchParams<{
    id: string;
    name?: string;
    source?: string;
    requestId?: string;
  }>();
  const [busy, setBusy] = useState<'accept' | 'ignore' | null>(null);

  async function respond(action: 'accept' | 'ignore') {
    if (!requestId) return;
    setBusy(action);
    try {
      await api(`/friend-requests/${requestId}/${action}`, { method: 'POST' });
      // Accepting opens the full profile in place of this one; ignoring is silent for the sender.
      if (action === 'accept') router.replace({ pathname: '/friend/[id]', params: { id } });
      else router.back();
    } catch {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title={name} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Avatar id={id} name={name} size={64} serif bordered />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.serif800, fontSize: 28, lineHeight: 31 }}>{name}</Text>
            <Text style={{ fontSize: 14, color: colors.text2 }}>
              {source && requestSource(source) !== 'Wants to be friends' ? `Wants to be friends. ${requestSource(source)}.` : 'Wants to be friends'}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 20, borderRadius: 14, backgroundColor: colors.muted }}>
          <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round">
            <Rect x="5" y="11" width="14" height="10" rx="2" />
            <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </Svg>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 20, textAlign: 'center' }}>Not friends yet</Text>
          <Text style={[type.body, { color: colors.text2, textAlign: 'center', lineHeight: 21 }]}>
            {`Once you're friends, you'll see how often you and ${name} vote the same, your agreement by topic, and more.`}
          </Text>
        </View>

        {requestId ? (
          <View style={{ gap: 10 }}>
            <PillButton label="Accept" busy={busy === 'accept'} disabled={!!busy} style={{ alignSelf: 'stretch', height: 50 }} onPress={() => respond('accept')} />
            <PillButton
              label="Ignore"
              variant="outline"
              busy={busy === 'ignore'}
              disabled={!!busy}
              style={{ alignSelf: 'stretch', height: 50 }}
              onPress={() => respond('ignore')}
            />
            <Text style={[type.meta, { textAlign: 'center' }]}>{`${name} won't be told if you ignore this.`}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
