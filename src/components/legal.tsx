import { Linking, Text, type TextStyle } from 'react-native';

export const TERMS_URL = 'https://docketapp.tech/terms';
export const PRIVACY_URL = 'https://docketapp.tech/privacy';
export const SUPPORT_URL = 'https://docketapp.tech/support';

export const NOT_AFFILIATED =
  'Docket is not affiliated with any government. Bills and votes come from official legislature records and Open States.';

/** "By continuing, you agree to the Terms of Use and Privacy Policy", with both linked. */
export function AgreeLine({ style }: { style?: TextStyle }) {
  const link: TextStyle = { textDecorationLine: 'underline', fontWeight: '600' };
  return (
    <Text style={style}>
      By continuing, you agree to the{' '}
      <Text accessibilityRole="link" style={link} onPress={() => Linking.openURL(TERMS_URL)}>
        Terms of Use
      </Text>{' '}
      and{' '}
      <Text accessibilityRole="link" style={link} onPress={() => Linking.openURL(PRIVACY_URL)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}
