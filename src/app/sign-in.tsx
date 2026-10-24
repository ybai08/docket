import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/ui';
import { authErrorMessage, isCancelled, useAuth } from '@/lib/auth-context';
import { isFirebaseConfigured } from '@/lib/firebaseConfig';
import { isAppleSignInAvailable, isGoogleConfigured } from '@/lib/social-auth';
import { colors, radius } from '@/lib/theme';

type Provider = 'google' | 'apple';

export default function SignInScreen() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function run(provider: Provider) {
    setError(null);
    setBusy(provider);
    try {
      await (provider === 'google' ? signInWithGoogle() : signInWithApple());
    } catch (err) {
      if (!isCancelled(err)) setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const setupMessage = !isFirebaseConfigured
    ? 'Firebase is not set up yet. Copy .env.example to .env, add your Firebase web config, then restart Expo.'
    : !isGoogleConfigured
      ? 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in .env, then a rebuild.'
      : null;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={{ gap: 8 }}>
          <Logo size={40} />
          <Text style={styles.tagline}>Real bills. Your call. Every day.</Text>
        </View>

        {setupMessage && <Text style={styles.warning}>{setupMessage}</Text>}

        <View style={{ gap: 12 }}>
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={radius.md}
              style={[styles.appleButton, (busy !== null || !isFirebaseConfigured) && { opacity: 0.5 }]}
              onPress={() => busy === null && isFirebaseConfigured && run('apple')}
            />
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => run('google')}
            disabled={busy !== null || !isFirebaseConfigured || !isGoogleConfigured}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && { opacity: 0.85 },
              (busy !== null || !isFirebaseConfigured || !isGoogleConfigured) && { opacity: 0.5 },
            ]}>
            {busy === 'google' ? (
              <ActivityIndicator color="#1F1F1F" />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Text style={styles.fine}>We only use your name and email to set up your profile.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 32,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  tagline: { color: colors.muted, fontSize: 16 },
  appleButton: { height: 52, width: '100%' },
  googleButton: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleG: { color: '#4285F4', fontSize: 20, fontWeight: '800' },
  googleText: { color: '#1F1F1F', fontSize: 17, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14 },
  warning: {
    color: colors.warningText,
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  fine: { color: colors.muted, fontSize: 13, textAlign: 'center' },
});
