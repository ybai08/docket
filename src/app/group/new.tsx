import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { SwitchRow } from '@/components/switch-row';
import { api } from '@/lib/api';
import { colors, fonts, type } from '@/theme';

export default function CreateGroup() {
  const [name, setName] = useState('');
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const g = await api<{ id: string }>('/groups', { method: 'POST', body: { name: name.trim(), approvalRequired: approval } });
      router.replace({ pathname: '/group/[id]', params: { id: g.id } });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScreenHeader title="New group" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 20 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 32, lineHeight: 36 }} accessibilityRole="header">
            Make a group
          </Text>
          <Text style={{ fontSize: 16, lineHeight: 22, color: colors.text2 }}>
            A weekly leaderboard and how your group voted on each bill. Splits stay anonymous.
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700' }} nativeID="group-name">
            Group name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Jester West, 4th floor"
            placeholderTextColor={colors.outline}
            maxLength={40}
            accessibilityLabelledBy="group-name"
            autoFocus
            style={{ height: 52, paddingHorizontal: 16, borderRadius: 12, borderWidth: 2, fontSize: 18, color: colors.ink }}
          />
        </View>
        <View style={{ borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' }}>
          <SwitchRow
            title="Approve new members"
            detail={approval ? 'You approve each person who joins' : 'Anyone with the code or link joins right away'}
            value={approval}
            onChange={setApproval}
          />
        </View>
        <Text style={type.meta}>Up to 50 members. You can rename the group, remove members or reset its code later.</Text>
        {error && <Text style={[type.meta, { color: colors.ink }]}>{error}</Text>}
        <View style={{ flex: 1 }} />
        <PillButton label="Create group" disabled={name.trim().length < 2} busy={busy} onPress={create} />
      </View>
    </SafeAreaView>
  );
}
