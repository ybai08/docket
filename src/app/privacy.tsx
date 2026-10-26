import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDeleteAccount } from '@/components/delete-account';
import { showAlert } from '@/components/dialog';
import { ScreenHeader } from '@/components/screen-header';
import { SwitchRow } from '@/components/switch-row';
import { api } from '@/lib/api';
import { useMe, type Profile } from '@/lib/me-context';
import { useRemote } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

type Key = keyof Pick<Profile, 'shareVotes' | 'groupBoards' | 'allowUsername'>;

export default function PrivacyScreen() {
  const { profile, patch } = useMe();
  const blocked = useRemote<{ blocked: { id: string; name: string }[] }>('/blocks');
  const [error, setError] = useState<string | null>(null);
  const deleteAccount = useDeleteAccount(setError);

  if (!profile) return null;

  const set = (key: Key) => (value: boolean) => {
    setError(null);
    patch({ [key]: value }).catch((err: Error) => setError(err.message));
  };

  function showBlocked() {
    const list = blocked.data?.blocked ?? [];
    if (!list.length) return showAlert('Blocked people', "You haven't blocked anyone.");
    showAlert(
      'Blocked people',
      'Unblocking lets them send you requests again. They are not told.',
      [
        ...list.map((p) => ({
          text: `Unblock ${p.name}`,
          onPress: async () => {
            await api(`/blocks/${p.id}`, { method: 'DELETE' }).catch(() => {});
            blocked.reload();
          },
        })),
        { text: 'Done', style: 'cancel' as const },
      ],
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title="Privacy" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 18 }}>
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 22 }} accessibilityRole="header">
            What friends see
          </Text>
          <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.muted, gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '800' }}>Always</Text>
            <Text style={{ fontSize: 14 }}>Your streak, scores and leaderboard rank</Text>
            <Text style={{ fontSize: 14 }}>How often you agree, overall and by topic</Text>
          </View>
        </View>

        <Section title="Your votes">
          <SwitchRow
            title="Share my vote on each bill"
            detail={profile.shareVotes ? 'Friends who also share can see how you voted' : 'Off. Friends see agreement, never your votes'}
            value={profile.shareVotes}
            onChange={set('shareVotes')}
          />
        </Section>

        <Section title="Groups and discovery">
          <SwitchRow
            title="Show me on group leaderboards"
            detail="Group splits only appear once 5 members vote"
            value={profile.groupBoards}
            onChange={set('groupBoards')}
          />
          <Divider />
          <SwitchRow
            title="Let people add me by username"
            detail={profile.username ? `@${profile.username}` : 'Set a username from Invite friends'}
            value={profile.allowUsername}
            onChange={set('allowUsername')}
          />
        </Section>

        {error && <Text style={[type.meta, { color: colors.ink }]}>{error}</Text>}

        <Section title="Your data">
          <Pressable
            accessibilityRole="button"
            onPress={showBlocked}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '600' }}>Blocked people</Text>
            <Text style={{ fontSize: 15, color: colors.text2 }}>{blocked.data?.blocked.length ?? 0}</Text>
          </Pressable>
          <Divider />
          <Pressable accessibilityRole="button" onPress={deleteAccount} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '600' }}>Delete my account and all my votes</Text>
          </Pressable>
        </Section>
        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.text2, marginTop: -10 }}>
          There are no public profiles and no search by name. Docket never sells or shares your votes.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={type.section} accessibilityRole="header">
        {title}
      </Text>
      <View style={{ borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: 14 }} />;
}
