import { useEffect } from 'react';
import { Modal, View, StyleSheet, Dimensions, TouchableOpacity, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  uri: string | null;
  isPdf?: boolean;
  visible: boolean;
  onClose: () => void;
}

export function ImageLightbox({ uri, isPdf, visible, onClose }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedX.value = 0;
      savedY.value = 0;
      opacity.value = 1;
    }
  }, [visible]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, Math.min(5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.5) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
      if (scale.value <= 1.05 && e.translationY > 0) {
        opacity.value = Math.max(0.2, 1 - e.translationY / 250);
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1.05 && e.translationY > 120) {
        opacity.value = withTiming(0, { duration: 150 }, () => runOnJS(onClose)());
      } else if (scale.value <= 1.05) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        opacity.value = withTiming(1);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
      }
    });

  const composed = Gesture.Simultaneous(
    Gesture.Race(doubleTap, panGesture),
    pinchGesture,
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const bgStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.bg, bgStyle]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.content, contentStyle]}>
            {isPdf ? (
              <View style={styles.pdfPlaceholder}>
                <Ionicons name="document-text" size={72} color="rgba(255,255,255,0.7)" />
                <Text style={styles.pdfLabel}>PDF — no visual preview</Text>
              </View>
            ) : uri ? (
              <Image source={{ uri }} style={{ width: SW, height: SH * 0.85 }} resizeMode="contain" />
            ) : null}
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#000' },
  closeBtn: { position: 'absolute', top: 54, right: 20, zIndex: 10, padding: 8 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pdfPlaceholder: { alignItems: 'center', gap: 12 },
  pdfLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
});
