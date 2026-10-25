import { useEffect } from 'react';
import { Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

type Props = {
  label: string;
  color: string;
  fontSize?: number;
  rotate?: number;
  /** Slam in on mount. Skipped when Reduce Motion is on. */
  animate?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/** Rubber-stamp label (VETOED, FAKE, FILED). Uppercase on purpose: it imitates a real stamp. */
export function Stamp({ label, color, fontSize = 22, rotate = -10, animate = true, delay = 0, style }: Props) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(animate && !reduceMotion ? 0 : 1);

  useEffect(() => {
    if (!animate || reduceMotion) return;
    progress.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 220 }));
  }, [animate, delay, progress, reduceMotion]);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.5),
    transform: [{ rotate: `${rotate}deg` }, { scale: 1.8 - 0.8 * progress.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: Math.round(fontSize * 0.55),
          paddingVertical: Math.round(fontSize * 0.14),
          borderWidth: 3,
          borderColor: color,
          borderRadius: 8,
        },
        animated,
        style,
      ]}>
      <Text style={{ color, fontSize, fontWeight: '900', letterSpacing: fontSize * 0.115 }}>{label}</Text>
    </Animated.View>
  );
}
