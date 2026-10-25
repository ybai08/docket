import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChevronRight } from '@/components/icons';
import { OnboardFrame, TextLink } from '@/components/onboard-frame';
import { PillButton } from '@/components/pill-button';
import { SwitchRow } from '@/components/switch-row';
import { useMe } from '@/lib/me-context';
import { colors, type } from '@/theme';

export default function OnboardFriends() {
  const { profile, patch } = useMe();
  const [reminder, setReminder] = useState(profile?.dailyReminder ?? true);
  const [share, setShare] = useState(profile?.shareVotes ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Finishing onboarding flips the root guard over to the tabs.
  async function finish() {
    setSaving(true);
    try {
      await patch({ dailyReminder: reminder, shareVotes: share, onboarded: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <OnboardFrame
      step={3}
      title="Play with friends"
      intro="See where you agree, race up the leaderboard, and keep each other's streaks alive."
      footer={
        <>
          <PillButton label="Start today's ballots" style={{ alignSelf: 'stretch' }} busy={saving} onPress={finish} />
          <TextLink label="Maybe later" onPress={finish} />
          {error && <Text style={type.meta}>{error}</Text>}
        </>
      }>
      <View style={{ gap: 10 }}>
        <Option title="Find friends in your contacts" detail="Only people already on Docket" filled />
        <Option title="Send an invite link" detail="Text it to your group chat" />
      </View>

      <View style={{ borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' }}>
        <SwitchRow
          title="Daily reminder"
          detail={reminder ? 'Every day at 9:00 AM, when new ballots drop' : 'Off. Your streak is on you.'}
          value={reminder}
          onChange={setReminder}
        />
        <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: 16 }} />
        <SwitchRow
          title="Show my votes to friends"
          detail={share ? 'Only friends you add can see them' : 'Friends see your score, not your votes'}
          value={share}
          onChange={setShare}
        />
      </View>
    </OnboardFrame>
  );
}

// Contacts and invites open from the Friends tab once friends ship.
function Option({ title, detail, filled }: { title: string; detail: string; filled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Available from the Friends tab after setup"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: filled ? colors.lavender : colors.ground,
        borderWidth: filled ? 0 : 1.5,
      }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.text2 }}>{detail}</Text>
      </View>
      <ChevronRight />
    </Pressable>
  );
}
