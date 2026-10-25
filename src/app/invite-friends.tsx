import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { showAlert, showPrompt } from '@/components/dialog';
import { ChevronRight } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { api } from '@/lib/api';
import { formatDayShort } from '@/lib/day';
import { inviteLink } from '@/lib/invite';
import { useMe } from '@/lib/me-context';
import { rollCallAgreement } from '@/lib/scoring';
import { shareText } from '@/lib/share';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

export default function InviteSheet() {
  const { day, set, progress, status } = useToday();
  const { profile, patch } = useMe();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [handle, setHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    api<{ token: string }>('/invites', { method: 'POST' })
      .then((r) => setToken(r.token))
      .catch((err: Error) => setError(err.message));
  }, []);

  const link = token ? inviteLink(token) : null;
  const squares = rollCallAgreement(set.rollCall, progress.rollCall.votes);

  async function copy() {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
  }

  async function addByUsername() {
    setAdding(true);
    setAdded(null);
    try {
      const res = await api<{ alreadyFriends?: boolean }>('/friend-requests', { method: 'POST', body: { username: handle } });
      setAdded(res.alreadyFriends ? 'You are already friends.' : 'Request sent. They can accept or ignore it.');
      setHandle('');
    } catch (err) {
      setAdded((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function editUsername() {
    showPrompt(
      'Your username',
      '3 to 20 lowercase letters, numbers or underscores. Friends can add you with it.',
      async (value) => {
        try {
          await patch({ username: value.trim().replace(/^@/, '').toLowerCase() });
        } catch (err) {
          showAlert("Couldn't save that username", (err as Error).message);
        }
      },
      profile?.username ?? '',
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ground }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 48, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontFamily: fonts.serif700, fontSize: 32 }} accessibilityRole="header">
          Invite friends
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={{ fontSize: 16, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </View>

      <View style={{ gap: 12, padding: 18, borderRadius: 14, borderWidth: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontFamily: fonts.serif800, fontSize: 20 }}>Docket</Text>
          <Text style={{ fontSize: 13, color: colors.text2 }}>{formatDayShort(day).replace('Oct', 'October')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>
            Roll Call {status.rollCall.state === 'done' ? `${status.rollCall.result}/${status.rollCall.total}` : 'not cast yet'}
          </Text>
          {status.rollCall.state === 'done' && (
            <View style={{ flexDirection: 'row', gap: 4 }} accessible accessibilityLabel={squares.map((a) => (a ? 'agreed' : 'disagreed')).join(', ')}>
              {squares.map((a, i) => (
                <View key={i} style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, backgroundColor: a ? colors.teal : colors.lavender }} />
              ))}
            </View>
          )}
        </View>
        <Row label="Filed or Fake" value={status.filedOrFake.state === 'done' ? `${status.filedOrFake.result}/${status.filedOrFake.total}` : '–'} />
        <Row label="Landslide" value={status.landslide.state === 'done' ? `${status.landslide.result} points` : '–'} />
        <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 19, color: colors.text2 }}>
          {"Play today's ballot and see where we agree. No bills or votes are shown here, so nothing gets spoiled."}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: -8 }}>
        <PillButton
          label="Share result"
          style={{ flex: 1, height: 50 }}
          disabled={!link}
          onPress={() => link && Share.share({ message: shareText(day, set, progress, status, link) })}
        />
        <PillButton label={copied ? 'Copied' : 'Copy link'} variant="outline" style={{ flex: 1, height: 50 }} disabled={!link} onPress={copy} />
      </View>
      {error && <Text style={type.meta}>{error}</Text>}

      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, borderRadius: 14, backgroundColor: colors.muted }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '700' }}>Meeting in person?</Text>
          <Text style={{ fontSize: 14, lineHeight: 19, color: colors.text2 }}>
            {"Have them scan this. You'll be friends right away."}
          </Text>
        </View>
        <View
          style={{ padding: 6, backgroundColor: colors.ground, borderRadius: 8 }}
          accessible
          accessibilityLabel="Your personal QR code">
          {token ? <QRCode value={inviteLink(token, 'qr')} size={96} /> : <View style={{ width: 96, height: 96 }} />}
        </View>
      </View>

      <View style={{ borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' }}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            showAlert(
              'Contact matching',
              'Matching works only when both people turn on "Match me from contacts" in Privacy. It arrives in a later update.',
            )
          }
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>Find friends in contacts</Text>
            <Text style={{ fontSize: 13, color: colors.text2 }}>Only people already on Docket</Text>
          </View>
          <ChevronRight />
        </Pressable>
        <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: 14 }} />
        <Pressable
          accessibilityRole="button"
          onPress={editUsername}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>Your username</Text>
            <Text style={{ fontSize: 13, color: colors.text2 }}>Friends can add you with it</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700' }}>{profile?.username ? `@${profile.username}` : 'Set one'}</Text>
        </Pressable>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={type.section}>Add by username</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="@username"
            placeholderTextColor={colors.outline}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Friend's username"
            style={{ flex: 1, height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, fontSize: 16, color: colors.ink }}
          />
          <PillButton label="Add" size="md" style={{ height: 48 }} disabled={!handle.trim()} busy={adding} onPress={addByUsername} />
        </View>
        {added && <Text style={type.meta}>{added}</Text>}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 14, fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: 14 }}>{value}</Text>
    </View>
  );
}
