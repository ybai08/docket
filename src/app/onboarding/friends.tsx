import { useState } from 'react';
import { Text, View } from 'react-native';

import { OnboardFrame, TextLink } from '@/components/onboard-frame';
import { PillButton } from '@/components/pill-button';
import { SwitchRow } from '@/components/switch-row';
import { useMe } from '@/lib/me-context';
import { type } from '@/theme';

export default function OnboardFriends() {
  const { profile, patch } = useMe();
  const [share, setShare] = useState(profile?.shareVotes ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Finishing onboarding flips the root guard over to the tabs.
  async function finish() {
    setSaving(true);
    try {
      await patch({ shareVotes: share, onboarded: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <OnboardFrame
      step={3}
      title="Play with friends"
      intro="See where you agree, race up the leaderboard, and keep each other's streaks alive. Add friends from the Friends tab."
      footer={
        <>
          <PillButton label="Start today's ballots" style={{ alignSelf: 'stretch' }} busy={saving} onPress={finish} />
          <TextLink label="Maybe later" onPress={finish} />
          {error && <Text style={type.meta}>{error}</Text>}
        </>
      }>
      <View style={{ borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' }}>
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
