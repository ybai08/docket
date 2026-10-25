import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { OnboardFrame } from '@/components/onboard-frame';
import { PillButton } from '@/components/pill-button';
import { TOPICS } from '@/data/types';
import { useMe } from '@/lib/me-context';
import { colors, type } from '@/theme';

export default function OnboardIssues() {
  const { profile, patch } = useMe();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(profile?.issues ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = picked.size;

  function toggle(topic: string) {
    Haptics.selectionAsync();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  }

  async function next() {
    setSaving(true);
    try {
      await patch({ issues: TOPICS.filter((t) => picked.has(t)) });
      router.push('/onboarding/friends');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardFrame
      step={2}
      title="What do you care about?"
      intro="Pick at least 3. We'll put more of these bills on your daily ballots. You'll still see every side."
      footer={
        <>
          <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 4 }} accessibilityLiveRegion="polite">
            {count >= 3 ? `${count} picked` : `Pick ${3 - count} more`}
          </Text>
          <PillButton label="Continue" style={{ alignSelf: 'stretch' }} disabled={count < 3} busy={saving} onPress={next} />
          {error && <Text style={type.meta}>{error}</Text>}
        </>
      }>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {TOPICS.map((t) => {
          const on = picked.has(t);
          return (
            <Pressable
              key={t}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(t)}
              style={{
                height: 44,
                paddingHorizontal: 16,
                borderRadius: 999,
                justifyContent: 'center',
                borderWidth: on ? 2 : 1.5,
                borderColor: on ? colors.ink : colors.outline,
                backgroundColor: on ? colors.lavender : colors.ground,
              }}>
              <Text style={{ fontSize: 15, fontWeight: '600' }}>{on ? `✓ ${t}` : t}</Text>
            </Pressable>
          );
        })}
      </View>
    </OnboardFrame>
  );
}
