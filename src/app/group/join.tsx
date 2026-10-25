import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { api } from '@/lib/api';
import type { GroupPreview } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

/** Join preview for a typed code, a docket://group/<code> link or a QR code. */
export default function JoinGroup() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (code.length !== 6) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      api<GroupPreview>(`/groups/preview/${code}`)
        .then((p) => {
          if (cancelled) return;
          setPreview(p);
          setError(null);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setPreview(null);
          setError(err.message);
        })
        .finally(() => !cancelled && setLoading(false));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code]);

  async function join() {
    if (!preview) return;
    if (preview.status === 'active') return router.replace({ pathname: '/group/[id]', params: { id: preview.id } });
    setJoining(true);
    try {
      const res = await api<{ id: string; status: 'active' | 'pending' }>('/groups/join', { method: 'POST', body: { code } });
      if (res.status === 'active') router.replace({ pathname: '/group/[id]', params: { id: res.id } });
      else setPending(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  const shown = code.length === 6 ? preview : null;
  const waiting = pending || shown?.status === 'pending';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScreenHeader title="Join a group" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 20 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700' }} nativeID="group-code">
            6-character code
          </Text>
          <TextInput
            value={code}
            onChangeText={(t) => {
              const next = t.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
              setCode(next);
              if (next.length === 6) Keyboard.dismiss();
            }}
            placeholder="ABC123"
            placeholderTextColor={colors.outline}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus={!params.code}
            accessibilityLabelledBy="group-code"
            style={{
              height: 56,
              paddingHorizontal: 16,
              borderRadius: 12,
              borderWidth: 2,
              fontSize: 24,
              letterSpacing: 6,
              fontVariant: ['tabular-nums'],
              color: colors.ink,
            }}
          />
        </View>

        {loading && <ActivityIndicator color={colors.ink} style={{ alignSelf: 'flex-start' }} />}
        {error && <Text style={[type.meta, { color: colors.ink }]}>{error}</Text>}

        {shown && (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, backgroundColor: colors.teal }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 12,
                  backgroundColor: colors.ground,
                  borderWidth: 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ fontFamily: fonts.serif800, fontSize: shown.badge.length > 2 ? 20 : 24 }}>{shown.badge}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.serif700, fontSize: 24, lineHeight: 27 }}>{shown.name}</Text>
                <Text style={{ fontSize: 13 }}>
                  {shown.members} {shown.members === 1 ? 'member' : 'members'}. Started by {shown.adminName}.
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 14, lineHeight: 19, color: colors.text2 }}>
              {waiting
                ? 'Request sent. The admin approves each new member.'
                : shown.full
                  ? 'This group is full.'
                  : shown.approvalRequired
                    ? 'The admin approves each new member.'
                    : 'Members see a weekly leaderboard and anonymous splits. Your individual votes stay private.'}
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }} />
        <PillButton
          label={shown?.status === 'active' ? 'Open group' : waiting ? 'Waiting for approval' : shown?.approvalRequired ? 'Ask to join' : 'Join group'}
          disabled={!shown || shown.full || waiting}
          busy={joining}
          onPress={join}
        />
      </View>
    </SafeAreaView>
  );
}
