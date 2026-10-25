import { Text, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { colors, type } from '@/theme';

export default function FriendsScreen() {
  return (
    <TabScreen gap={14}>
      <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.ink }}>
        <Text style={type.title} accessibilityRole="header">
          Friends
        </Text>
      </View>
      <Text style={type.meta}>Friends and groups arrive in a later update.</Text>
    </TabScreen>
  );
}
