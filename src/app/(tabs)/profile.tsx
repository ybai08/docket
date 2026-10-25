import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { PillButton } from '@/components/pill-button';
import { TabScreen } from '@/components/tab-screen';
import { authErrorMessage, useAuth } from '@/lib/auth-context';
import { colors, type } from '@/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  // Apple's "Hide My Email" gives a random relay address; don't show it as a name.
  const hiddenEmail = user.email?.endsWith('@privaterelay.appleid.com') ?? false;
  const name = user.displayName || (!hiddenEmail && user.email?.split('@')[0]) || 'Docket member';

  function confirmSignOut() {
    Alert.alert('Sign out of Docket?', 'You can sign back in anytime with Apple or Google.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut().catch((err) => setError(authErrorMessage(err))),
      },
    ]);
  }

  return (
    <TabScreen gap={14}>
      <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.ink }}>
        <Text style={type.title} accessibilityRole="header">
          {name}
        </Text>
      </View>
      <PillButton label="Sign out" variant="outline" onPress={confirmSignOut} />
      {error && (
        <Text style={type.meta} selectable>
          {error}
        </Text>
      )}
    </TabScreen>
  );
}
