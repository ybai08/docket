import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';

export default function Screen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="filed-or-fake" />
    </View>
  );
}
