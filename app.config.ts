import type { ConfigContext, ExpoConfig } from 'expo/config';

// Google Sign-In on iOS needs the reversed iOS client ID as a URL scheme.
// Expo loads .env before evaluating this file. Rebuild after changing it.
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const iosUrlScheme = iosClientId
  ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
  : 'com.googleusercontent.apps.missing-ios-client-id';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Docket',
  slug: config.slug ?? 'docket',
  plugins: [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]],
});
