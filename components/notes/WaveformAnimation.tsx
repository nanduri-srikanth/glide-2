import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { NotesColors } from '@/constants/theme';

interface WaveformAnimationProps {
  isRecording: boolean;
  barCount?: number;
}

const BAR_COUNT = 40;
const MIN_HEIGHT = 8;
const MAX_HEIGHT = 80;

function WaveBar({ index, isRecording }: { index: number; isRecording: boolean }) {
  const height = useSharedValue(MIN_HEIGHT);

  useEffect(() => {
    if (isRecording) {
      const randomDelay = Math.random() * 300;
      const randomDuration = 300 + Math.random() * 400;

      height.value = withDelay(
        randomDelay,
        withRepeat(
          withTiming(MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT), {
            duration: randomDuration,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true
        )
      );
    } else {
      height.value = withTiming(MIN_HEIGHT, { duration: 300 });
    }
  }, [isRecording, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View style={[styles.barContainer, animatedStyle]}>
      <LinearGradient
        colors={[NotesColors.secondary, NotesColors.primary]}
        style={styles.bar}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
    </Animated.View>
  );
}

export function WaveformAnimation({ isRecording, barCount = BAR_COUNT }: WaveformAnimationProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: barCount }).map((_, index) => (
        <WaveBar key={index} index={index} isRecording={isRecording} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MAX_HEIGHT + 20,
    gap: 3,
  },
  barContainer: {
    width: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    flex: 1,
    width: '100%',
    borderRadius: 2,
  },
});
