import { Image } from 'expo-image';
import { Fragment, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { authErrorMessage, useAuth } from '@/lib/auth-context';
import { colors, radius, spacing, useBrandColors } from '@/theme';

// Placeholder stats until the game backend exists.
const STATS = [
  { label: 'Day streak', value: 0 },
  { label: 'Bills voted', value: 0 },
  { label: 'Friends', value: 0 },
];

const PROVIDER_NAMES: Record<string, string> = { 'google.com': 'Google', 'apple.com': 'Apple' };

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const brand = useBrandColors();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  // Apple's "Hide My Email" gives a random relay address; don't show it as a name.
  const hiddenEmail = user.email?.endsWith('@privaterelay.appleid.com') ?? false;
  const name = user.displayName || (!hiddenEmail && user.email?.split('@')[0]) || 'Docket member';
  const emailLabel = hiddenEmail ? 'Email hidden with Apple' : user.email;
  const joined = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;
  const provider = PROVIDER_NAMES[user.providerData[0]?.providerId ?? ''];

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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, width: '100%', maxWidth: 600, alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {user.photoURL ? (
          <Image
            source={{ uri: user.photoURL }}
            style={{ width: 72, height: 72, borderRadius: radius.full }}
            accessibilityLabel={`${name}'s profile photo`}
          />
        ) : (
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: radius.full,
              backgroundColor: brand.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ThemedText variant="title" style={{ color: brand.onInk, fontSize: 30 }}>
              {name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText variant="title" numberOfLines={2}>
            {name}
          </ThemedText>
          {emailLabel && (
            <ThemedText variant="subhead" selectable={!hiddenEmail} numberOfLines={1}>
              {emailLabel}
            </ThemedText>
          )}
          {joined && (
            <ThemedText variant="footnote" style={{ color: colors.tertiaryLabel }}>
              Joined {joined}
            </ThemedText>
          )}
        </View>
      </View>

      <Group>
        <View style={{ flexDirection: 'row' }}>
          {STATS.map((s, i) => (
            <Fragment key={s.label}>
              {i > 0 && <View style={{ width: 0.5, backgroundColor: colors.separator, marginVertical: spacing.md }} />}
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md, gap: 2 }}>
                <ThemedText variant="stat">{s.value}</ThemedText>
                <ThemedText variant="footnote">{s.label}</ThemedText>
              </View>
            </Fragment>
          ))}
        </View>
      </Group>

      <Group title="Issue profile">
        <ThemedText variant="subhead" style={{ padding: spacing.md }}>
          Vote on your first Daily 5 to see which issues you care about most.
        </ThemedText>
      </Group>

      <Group title="Account">
        {provider && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }}>
              <ThemedText>Signed in with</ThemedText>
              <ThemedText style={{ color: colors.secondaryLabel }}>{provider}</ThemedText>
            </View>
            <View style={{ height: 0.5, backgroundColor: colors.separator, marginLeft: spacing.md }} />
          </>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={confirmSignOut}
          style={({ pressed }) => ({ padding: spacing.md, backgroundColor: pressed ? colors.separator : 'transparent' })}>
          <ThemedText style={{ color: colors.vetoed }}>Sign out</ThemedText>
        </Pressable>
      </Group>

      {error && (
        <ThemedText variant="footnote" selectable style={{ color: colors.vetoed }}>
          {error}
        </ThemedText>
      )}
    </ScrollView>
  );
}

// iOS inset-grouped section: background and hairlines instead of a card per row.
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {title && (
        <ThemedText variant="footnote" accessibilityRole="header" style={{ paddingHorizontal: spacing.md }}>
          {title}
        </ThemedText>
      )}
      <View
        style={{
          backgroundColor: colors.groupedSurface,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}>
        {children}
      </View>
    </View>
  );
}
