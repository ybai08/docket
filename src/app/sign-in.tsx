import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Logo, TextField } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/lib/auth-context';
import { isFirebaseConfigured } from '@/lib/firebaseConfig';
import { colors, radius } from '@/lib/theme';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === 'sign-up';
  const canSubmit = email.length > 0 && password.length > 0 && (!isSignUp || name.trim().length > 0);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      if (isSignUp) await signUp(name, email, password);
      else await signIn(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    setError(null);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8 }}>
            <Logo size={40} />
            <Text style={styles.tagline}>Real bills. Your call. Every day.</Text>
          </View>

          {!isFirebaseConfigured && (
            <Text style={styles.warning}>
              Firebase is not set up yet. Copy .env.example to .env, add your Firebase web config, then restart Expo.
            </Text>
          )}

          <View style={{ gap: 14 }}>
            <Text style={styles.heading}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>
            {isSignUp && (
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Alex Rivera"
                autoComplete="name"
                textContentType="name"
              />
            )}
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@utexas.edu"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              onSubmitEditing={() => canSubmit && submit()}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button
              title={isSignUp ? 'Sign up' : 'Sign in'}
              onPress={submit}
              loading={loading}
              disabled={!canSubmit || !isFirebaseConfigured}
            />
          </View>

          <Pressable onPress={switchMode} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? ' : 'New to Docket? '}
              <Text style={{ color: colors.accent, fontWeight: '700' }}>{isSignUp ? 'Sign in' : 'Create one'}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 28,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  tagline: { color: colors.muted, fontSize: 16 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14 },
  warning: {
    color: colors.warningText,
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  switchText: { color: colors.muted, fontSize: 15 },
});
