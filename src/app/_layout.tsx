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
import { colors } from '@/theme';

function RootStack() {
  const { user, initializing } = useAuth();

  if (initializing) {
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
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="roll-call/index" />
        <Stack.Screen name="roll-call/results" />
        <Stack.Screen name="filed-or-fake" />
        <Stack.Screen name="landslide" />
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
        <GameStoreProvider>
          <StatusBar style="dark" />
          {fontsLoaded ? <RootStack /> : null}
        </GameStoreProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
