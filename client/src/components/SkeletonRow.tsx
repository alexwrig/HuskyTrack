import { View, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { useTheme } from 'react-native-paper';
import { spacing, radius } from '../theme';

interface SkeletonRowProps {
  lines?: number;
}

export function SkeletonRow({ lines = 1 }: SkeletonRowProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const bg = theme.dark ? '#374151' : '#e5e7eb';

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.line,
            { backgroundColor: bg, width: i % 2 === 0 ? '80%' : '60%' },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  line: {
    height: 14,
    borderRadius: radius.sm,
  },
});
