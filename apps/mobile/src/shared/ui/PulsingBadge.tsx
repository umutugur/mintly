import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

interface PulsingBadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: 'sm' | 'md';
}

export function PulsingBadge({
  label,
  color = '#5961E9',
  textColor = '#FFFFFF',
  size = 'md',
}: PulsingBadgeProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.14, duration: 800, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.88, duration: 800, useNativeDriver: true }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [scaleAnim, opacityAnim]);

  const isSmall = size === 'sm';

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          backgroundColor: color,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
          paddingHorizontal: isSmall ? 8 : 11,
          paddingVertical: isSmall ? 3 : 5,
        },
      ]}
    >
      <Text style={[styles.text, { color: textColor, fontSize: isSmall ? 10 : 12 }]}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: 20,
    justifyContent: 'center',
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
