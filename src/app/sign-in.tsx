import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillChip } from '@/components/bill-chip';
import { GoogleG } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { Stamp } from '@/components/stamp';
import { authErrorMessage, isCancelled, useAuth } from '@/lib/auth-context';
import { isFirebaseConfigured } from '@/lib/firebaseConfig';
import { isAppleSignInAvailable, isGoogleConfigured } from '@/lib/social-auth';
import { colors, fonts, radius, type } from '@/theme';

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
  const locked = busy !== null || !isFirebaseConfigured;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, gap: 28, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <View style={{ gap: 10 }}>
          <Text style={type.wordmark} accessibilityRole="header">
            Docket
          </Text>
          <Text style={{ fontSize: 18, lineHeight: 25, color: colors.text2, maxWidth: 310 }}>
            Daily ballots on real bills from Congress and your state. Vote, guess, rank, then see how your friends and
            lawmakers voted.
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <BillStack />
        </View>

        <View style={{ gap: 12 }}>
          {setupMessage && (
            <Text
              selectable
              style={[type.meta, { backgroundColor: colors.muted, borderRadius: radius.card, padding: 12, color: colors.text2 }]}>
              {setupMessage}
            </Text>
          )}

          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={27}
              style={{ height: 54, width: '100%', opacity: locked ? 0.5 : 1 }}
              onPress={() => !locked && run('apple')}
            />
          )}

          <PillButton
            label="Continue with Google"
            variant="outline"
            icon={<GoogleG />}
            busy={busy === 'google'}
            disabled={locked || !isGoogleConfigured}
            onPress={() => run('google')}
          />

          {error && (
            <Text selectable style={[type.meta, { color: colors.ink, textAlign: 'center' }]}>
              {error}
            </Text>
          )}

          <Text style={[type.meta, { marginTop: 4, textAlign: 'center' }]}>
            We use your name and email only for your profile. We never ask for your party.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// A real 2025 bill as a game card: the one bold element on this screen.
function BillStack() {
  const back = {
    position: 'absolute' as const,
    top: 0,
    height: 220,
    borderRadius: radius.bill,
    borderWidth: 2,
    borderColor: colors.ink,
  };

  return (
    <View
      style={{ height: 252 }}
      accessible
      accessibilityLabel="Example card: Senate Bill 3, ban hemp-derived THC products in Texas. Passed the House and Senate, then vetoed.">
      <View style={[back, { left: 16, right: 0, top: 20, backgroundColor: colors.teal, transform: [{ rotate: '4deg' }] }]} />
      <View style={[back, { left: 8, right: 8, top: 10, backgroundColor: colors.yellow, transform: [{ rotate: '-3deg' }] }]} />
      <View
        style={[
          back,
          { left: 0, right: 16, padding: 20, gap: 10, backgroundColor: colors.ground },
        ]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <BillChip number="SB 3" level="state" />
          <Text style={type.meta}>Texas Senate, 2025</Text>
        </View>
        <Text style={{ fontFamily: fonts.serif700, fontSize: 27, lineHeight: 31, maxWidth: 260 }}>
          Ban hemp-derived THC products in Texas
        </Text>
        <Text style={{ fontSize: 14, color: colors.meta }}>Passed the House and Senate.</Text>
        <Stamp
          label="VETOED"
          color={colors.vetoRed}
          fontSize={22}
          rotate={-10}
          delay={500}
          style={{ position: 'absolute', right: 18, bottom: 16 }}
        />
      </View>
    </View>
  );
}
