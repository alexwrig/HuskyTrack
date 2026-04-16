import { useState, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Alert, Animated as RNAnimated, Image,
} from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius } from '../../src/theme';

const { width: SW } = Dimensions.get('window');
const FRAME_W = SW * 0.82;
const FRAME_H = FRAME_W * 1.4;
const CORNER = 22;

type EnhancementMode = 'color' | 'grayscale' | 'bw';
type Phase = 'camera' | 'review';

interface Page {
  id: string;
  uri: string;
  enhancement: EnhancementMode;
}

let _seq = 0;
function nextId() { return String(++_seq); }

export default function ScannerModal() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('camera');
  const [pages, setPages] = useState<Page[]>([]);
  const [autoCapture, setAutoCapture] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedPage, setSelectedPage] = useState(0);

  const progressAnim = useRef(new RNAnimated.Value(0)).current;
  const timerRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  function startAutoTimer() {
    progressAnim.setValue(0);
    timerRef.current = RNAnimated.timing(progressAnim, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false,
    });
    timerRef.current.start(({ finished }) => { if (finished) handleCapture(); });
  }

  function cancelAutoTimer() {
    timerRef.current?.stop();
    progressAnim.setValue(0);
  }

  async function handleCapture() {
    if (capturing) return;
    setCapturing(true);
    cancelAutoTimer();
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        const dest = `${FileSystem.cacheDirectory ?? ''}scanner_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: photo.uri, to: dest });
        const id = nextId();
        setPages((prev) => [...prev, { id, uri: dest, enhancement: 'color' }]);
      }
    } catch {
      Alert.alert('Error', 'Failed to capture photo');
    } finally {
      setCapturing(false);
      if (autoCapture) startAutoTimer();
    }
  }

  function removePage(id: string) {
    setPages((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setSelectedPage((s) => Math.min(s, Math.max(0, next.length - 1)));
      return next;
    });
  }

  async function finishSession() {
    if (pages.length === 0) {
      Alert.alert('No pages', 'Capture at least one page first.');
      return;
    }
    router.replace({
      pathname: '/modals/batch-upload',
      params: { scannerUris: JSON.stringify(pages.map((p) => p.uri)) },
    });
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: '#000' }]}>
        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: spacing.md }}>
          Camera access is needed to scan receipts.
        </Text>
        <Button mode="contained" onPress={requestPermission}>Grant Permission</Button>
        <Button onPress={() => router.back()} textColor="#fff" style={{ marginTop: spacing.sm }}>Cancel</Button>
      </SafeAreaView>
    );
  }

  // ── Camera phase ──────────────────────────────────────────────────────────

  if (phase === 'camera') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          {/* Frame overlay */}
          <View style={styles.frameOverlay}>
            <View style={[styles.frameBox, { width: FRAME_W, height: FRAME_H }]}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <Text style={styles.frameHint}>
              {autoCapture ? 'Hold steady to auto-capture…' : 'Align receipt · tap to capture'}
            </Text>
          </View>

          {/* Auto-capture progress bar */}
          {autoCapture && (
            <View style={styles.progressTrack}>
              <RNAnimated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
          )}

          {/* Filmstrip */}
          {pages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filmstrip}
              contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: spacing.xs, alignItems: 'center' }}
            >
              {pages.map((page, i) => (
                <TouchableOpacity
                  key={page.id}
                  onLongPress={() => removePage(page.id)}
                  style={[styles.filmThumb, i === pages.length - 1 && styles.filmThumbActive]}
                >
                  <Image source={{ uri: page.uri }} style={styles.filmImg} />
                  <Text style={styles.filmNum}>{i + 1}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <SafeAreaView style={styles.controls}>
            <TouchableOpacity onPress={() => router.back()} style={styles.ctrlBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCapture}
              style={styles.shutter}
              disabled={capturing}
            >
              <View style={[styles.shutterInner, capturing && { opacity: 0.5 }]} />
            </TouchableOpacity>

            <View style={styles.rightPanel}>
              <TouchableOpacity
                onPress={() => {
                  const next = !autoCapture;
                  setAutoCapture(next);
                  if (next) startAutoTimer(); else cancelAutoTimer();
                }}
                style={styles.ctrlBtn}
              >
                <Ionicons
                  name={autoCapture ? 'timer' : 'timer-outline'}
                  size={24}
                  color={autoCapture ? '#fbbf24' : '#fff'}
                />
              </TouchableOpacity>

              {pages.length > 0 && (
                <TouchableOpacity onPress={() => setPhase('review')} style={styles.ctrlBtn}>
                  <Ionicons name="checkmark-circle" size={28} color="#4ade80" />
                  <Text style={styles.pageCount}>{pages.length}</Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ── Review phase ──────────────────────────────────────────────────────────

  const currentPage = pages[selectedPage];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.reviewHeader}>
        <TouchableOpacity onPress={() => setPhase('camera')}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text variant="titleMedium" style={{ fontWeight: '700' }}>
          Review · {pages.length} page{pages.length !== 1 ? 's' : ''}
        </Text>
        <Button mode="contained" onPress={finishSession} icon="check">Done</Button>
      </View>

      {currentPage && (
        <Image source={{ uri: currentPage.uri }} style={styles.reviewImg} resizeMode="contain" />
      )}

      {/* Enhancement mode selector */}
      <View style={styles.enhRow}>
        {(['color', 'grayscale', 'bw'] as EnhancementMode[]).map((mode) => {
          const active = (currentPage?.enhancement ?? 'color') === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.enhBtn, { backgroundColor: active ? theme.colors.primary : theme.colors.surface }]}
              onPress={() => {
                if (mode !== 'color') {
                  Alert.alert(
                    'Dev Build Required',
                    'Grayscale and B&W processing require a native dev build (expo run:ios). Color mode is always available.',
                  );
                  return;
                }
                if (currentPage) {
                  setPages((prev) =>
                    prev.map((p) => p.id === currentPage.id ? { ...p, enhancement: mode } : p),
                  );
                }
              }}
            >
              <Text variant="labelSmall" style={{ color: active ? '#fff' : theme.colors.onSurface }}>
                {mode === 'color' ? 'Color' : mode === 'grayscale' ? 'Grayscale' : 'B&W'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filmstrip thumbnails + add button */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm, paddingVertical: spacing.sm }}
      >
        {pages.map((page, i) => (
          <TouchableOpacity
            key={page.id}
            onPress={() => setSelectedPage(i)}
            onLongPress={() =>
              Alert.alert('Remove Page', 'Remove this page?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removePage(page.id) },
              ])
            }
            style={[
              styles.reviewThumb,
              { borderColor: i === selectedPage ? theme.colors.primary : theme.colors.outline, borderWidth: i === selectedPage ? 2 : 1 },
            ]}
          >
            <Image source={{ uri: page.uri }} style={styles.reviewThumbImg} />
            <Text style={[styles.filmNum, { color: '#fff' }]}>{i + 1}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.reviewThumb, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }]}
          onPress={() => setPhase('camera')}
        >
          <Ionicons name="add" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  frameOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frameBox: { position: 'relative' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', borderWidth: 2.5 },
  tl: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 4 },
  frameHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 16 },
  progressTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: spacing.xl },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  filmstrip: { flexGrow: 0, maxHeight: 72, marginBottom: spacing.xs },
  filmThumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  filmThumbActive: { borderColor: '#fff', borderWidth: 2 },
  filmImg: { width: '100%', height: '100%' },
  filmNum: { position: 'absolute', bottom: 2, right: 4, fontSize: 9, fontWeight: '800', color: '#fff' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  ctrlBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  rightPanel: { width: 44, alignItems: 'center', gap: spacing.xs },
  pageCount: { color: '#fff', fontSize: 11, fontWeight: '800' },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  reviewImg: { flex: 1, width: '100%' },
  enhRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  enhBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  reviewThumb: { width: 64, height: 64, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' },
  reviewThumbImg: { width: '100%', height: '100%' },
});
