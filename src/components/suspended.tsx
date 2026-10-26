import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDeleteAccount } from '@/components/delete-account';
import { PillButton } from '@/components/pill-button';
import { useAuth } from '@/lib/auth-context';
import { colors, fonts, type } from '@/theme';

/** Shown in place of the app when the server suspends the account. Deleting it stays possible. */
export function Suspended({ message }: { message: string }) {
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const deleteAccount = useDeleteAccount(setError);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 }}>
        <Text style={{ fontFamily: fonts.serif800, fontSize: 32, lineHeight: 36 }} accessibilityRole="header">
          Account suspended
        </Text>
        <Text style={[type.body, { color: colors.text2, lineHeight: 22 }]}>{message}</Text>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        {error && <Text style={[type.meta, { color: colors.ink, textAlign: 'center' }]}>{error}</Text>}
        <PillButton label="Sign out" style={{ alignSelf: 'stretch', height: 52 }} onPress={() => signOut().catch(() => {})} />
        <PillButton label="Delete my account" variant="outline" style={{ alignSelf: 'stretch', height: 52 }} onPress={deleteAccount} />
      </View>
    </SafeAreaView>
  );
}
