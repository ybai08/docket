import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Logo } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/lib/auth-context';
import { colors, radius } from '@/lib/theme';

// Placeholder stats until the game backend exists.
const STATS = [
  { label: 'Day streak', value: '0' },
  { label: 'Bills voted', value: '0' },
  { label: 'Friends', value: '0' },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const name = user.displayName || user.email?.split('@')[0] || 'You';
  const joined = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Logo />

        <View style={styles.header}>
          {user.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.muted}>{user.email}</Text>
          {joined && <Text style={styles.muted}>Joined {joined}</Text>}
        </View>

        <View style={styles.stats}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your issue profile</Text>
          <Text style={styles.muted}>Vote on your first Daily 5 to see which issues you care about most.</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        <Button title="Sign out" variant="ghost" onPress={handleSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 24, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { alignItems: 'center', gap: 6 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: { color: colors.accentText, fontSize: 36, fontWeight: '800' },
  name: { color: colors.text, fontSize: 24, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, gap: 6 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
});
