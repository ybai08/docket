import {
  Newsreader_500Medium,
  Newsreader_500Medium_Italic,
  Newsreader_700Bold,
  Newsreader_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { GameStoreProvider } from '@/lib/game-store';
import { MeProvider, useMe } from '@/lib/me-context';
import { TodayProvider } from '@/lib/use-today';
import { colors } from '@/theme';

function RootStack() {
  const { user, initializing } = useAuth();
  const me = useMe();
  // New accounts onboard first. If the API is unreachable, skip ahead and play offline.
  const needsOnboarding = !!user && me.state === 'ready' && me.profile?.onboarded === false;
  const loadingProfile = !!user && me.state === 'loading';

  if (initializing || loadingProfile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !needsOnboarding}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="roll-call/index" />
        <Stack.Screen name="roll-call/results" />
        <Stack.Screen name="roll-call/review" />
        <Stack.Screen name="filed-or-fake" />
        <Stack.Screen name="landslide" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="friend/[id]" />
        <Stack.Screen name="invite/[token]" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="invite-friends"
          options={{ presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.92], sheetCornerRadius: 20 }}
        />
        <Stack.Screen name="group/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="group/join" options={{ presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Newsreader_500Medium,
    Newsreader_500Medium_Italic,
    Newsreader_700Bold,
    Newsreader_800ExtraBold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
      <AuthProvider>
        <MeProvider>
          <GameStoreProvider>
            <TodayProvider>
              <StatusBar style="dark" />
              {fontsLoaded ? <RootStack /> : null}
            </TodayProvider>
          </GameStoreProvider>
        </MeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
