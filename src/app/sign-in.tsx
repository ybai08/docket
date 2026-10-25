import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { authErrorMessage, isCancelled, useAuth } from '@/lib/auth-context';
import { isFirebaseConfigured } from '@/lib/firebaseConfig';
import { isAppleSignInAvailable, isGoogleConfigured } from '@/lib/social-auth';
import { colors, radius, shadows, spacing, type, useBrandColors } from '@/theme';

type Provider = 'google' | 'apple';

export default function SignInScreen() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const scheme = useColorScheme();
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
  const locked = busy !== null || !isFirebaseConfigured;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      <View style={{ flex: 1, padding: spacing.lg, gap: spacing.xl, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
          <ThemedText variant="wordmark" accessibilityRole="header">
            Docket
          </ThemedText>
          <ThemedText variant="callout" style={{ maxWidth: 320 }}>
            Vote on real Texas bills, then see how your friends and lawmakers voted.
          </ThemedText>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <BillStack />
        </View>

        <View style={{ gap: spacing.md }}>
          {setupMessage && (
            <ThemedText
              variant="footnote"
              selectable
              style={{
                backgroundColor: colors.groupedSurface,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                padding: spacing.md,
              }}>
              {setupMessage}
            </ThemedText>
          )}

          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.md}
              style={{ height: 50, width: '100%', opacity: locked ? 0.5 : 1 }}
              onPress={() => !locked && run('apple')}
            />
          )}

          <GoogleButton
            busy={busy === 'google'}
            disabled={locked || !isGoogleConfigured}
            onPress={() => run('google')}
          />

          {error && (
            <ThemedText variant="footnote" selectable style={{ color: colors.vetoed }}>
              {error}
            </ThemedText>
          )}

          <ThemedText variant="footnote" style={{ color: colors.tertiaryLabel }}>
            We use your name and email only to set up your profile.
          </ThemedText>
        </View>
      </View>
    </SafeAreaView>
  );
}

function GoogleButton({ busy, disabled, onPress }: { busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 50,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.separator,
        backgroundColor: colors.groupedSurface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        opacity: disabled && !busy ? 0.5 : pressed ? 0.7 : 1,
      })}>
      {busy ? (
        <ActivityIndicator color={colors.label} />
      ) : (
        <>
          {/* Google's brand blue for the "G" mark; not a theme color. */}
          <ThemedText style={{ ...type.headline, fontSize: 19, fontWeight: '800', color: '#4285F4' }}>G</ThemedText>
          <ThemedText variant="headline" style={{ fontSize: 19 }}>
            Continue with Google
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

// A real 2025 bill as a game card: the one bold element on this screen.
function BillStack() {
  const brand = useBrandColors();
  const stamp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return stamp.setValue(1);
      Animated.spring(stamp, { toValue: 1, delay: 500, friction: 5, tension: 120, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [stamp]);

  const card = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: 224,
    borderRadius: radius.lg,
    borderCurve: 'continuous' as const,
    backgroundColor: colors.groupedSurface,
    borderWidth: 1,
    borderColor: colors.separator,
  };

  return (
    <View
      style={{ height: 258, marginHorizontal: spacing.sm }}
      accessible
      accessibilityLabel="Example card: Senate Bill 3, ban hemp-derived THC products in Texas. Passed the House and Senate, then vetoed.">
      <View style={[card, { top: 22, transform: [{ rotate: '4deg' }], opacity: 0.55 }]} />
      <View style={[card, { top: 12, transform: [{ rotate: '-3deg' }], opacity: 0.8 }]} />
      <View style={[card, { top: 0, padding: spacing.lg, gap: spacing.sm, boxShadow: shadows.raised }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <ThemedText variant="billNumber" style={{ color: brand.ink }}>
            SB 3
          </ThemedText>
          <ThemedText variant="billNumber" style={{ fontWeight: '500' }}>
            Texas Senate, 2025
          </ThemedText>
        </View>
        <ThemedText variant="title" style={{ fontSize: 24, lineHeight: 29, maxWidth: 300 }}>
          Ban hemp-derived THC products in Texas
        </ThemedText>
        <ThemedText variant="subhead">Passed the House and Senate.</ThemedText>

        <Animated.View
          style={{
            position: 'absolute',
            right: spacing.lg,
            bottom: spacing.lg,
            borderWidth: 3,
            borderColor: colors.vetoed,
            borderRadius: radius.sm,
            borderCurve: 'continuous',
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
            opacity: stamp,
            transform: [
              { rotate: '-11deg' },
              { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) },
            ],
          }}>
          {/* Uppercase on purpose: it imitates a real rubber stamp. */}
          <ThemedText style={{ fontSize: 20, fontWeight: '900', letterSpacing: 2, color: colors.vetoed }}>
            VETOED
          </ThemedText>
        </Animated.View>
      </View>
    </View>
  );
}
