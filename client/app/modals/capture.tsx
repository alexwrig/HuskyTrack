import { useState, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, Image,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text, useTheme, Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { parseReceiptImage } from '../../src/services/anthropic';
import { saveReceiptImage, readImageAsBase64 } from '../../src/services/imageStorage';
import * as db from '../../src/services/database';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import { CategoryPicker } from '../../src/components/CategoryPicker';
import type { ExpenseCategory, ParsedReceiptFields } from '../../src/types';
import { spacing, radius } from '../../src/theme';

type Step = 'camera' | 'preview' | 'form';

export default function CaptureModal() {
  const theme = useTheme();
  const { addReceipt } = useReceiptsStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>('camera');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fields, setFields] = useState<ParsedReceiptFields>({
    date: new Date().toISOString().slice(0, 10),
    merchant: null, amount: null, suggested_category: null,
    purpose: null, card_last_four: null,
  });

  async function handleCapture() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) { setImageUri(photo.uri); setStep('preview'); }
    } catch { Alert.alert('Error', 'Failed to take photo'); }
  }

  async function handlePickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setStep('preview');
    }
  }

  async function handleParse() {
    if (!imageUri) return;
    setParsing(true);
    try {
      const base64 = await readImageAsBase64(imageUri);
      const parsed = await parseReceiptImage(base64);
      setFields({
        date: parsed.date ?? new Date().toISOString().slice(0, 10),
        merchant: parsed.merchant,
        amount: parsed.amount,
        suggested_category: parsed.suggested_category,
        purpose: parsed.purpose,
        card_last_four: parsed.card_last_four,
      });
      setStep('form');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse failed';
      Alert.alert('Could not parse receipt', `${msg}\n\nYou can fill in the details manually.`);
      setStep('form');
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!fields.merchant || !fields.amount || !fields.date) {
      Alert.alert('Missing fields', 'Date, merchant, and amount are required.');
      return;
    }
    setSaving(true);
    try {
      // Save image to permanent local storage
      const savedUri = imageUri ? await saveReceiptImage(imageUri) : null;

      const receipt = await db.createReceipt({
        date: fields.date!,
        merchant: fields.merchant!,
        amount: fields.amount!,
        category: (fields.suggested_category ?? 'Other') as ExpenseCategory,
        purpose: fields.purpose ?? null,
        card_last_four: fields.card_last_four ?? null,
        image_uri: savedUri,
      });

      addReceipt(receipt);
      router.back();
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  // ── Camera step ──────────────────────────────────────────────────────────────
  if (step === 'camera') {
    if (!permission?.granted) {
      return (
        <SafeAreaView style={[styles.center, { backgroundColor: '#000' }]}>
          <Text style={{ color: '#fff', marginBottom: spacing.md, textAlign: 'center' }}>
            Camera access is required to scan receipts.
          </Text>
          <Button mode="contained" onPress={requestPermission}>Grant Permission</Button>
          <Button onPress={() => router.back()} textColor="#fff" style={{ marginTop: spacing.sm }}>Cancel</Button>
        </SafeAreaView>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          <View style={styles.overlay}>
            <View style={styles.frame} />
            <Text style={styles.overlayHint}>Align receipt within the frame</Text>
          </View>
          <SafeAreaView style={styles.cameraControls}>
            <TouchableOpacity onPress={() => router.back()} style={styles.controlBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCapture} style={styles.shutterBtn}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickFromLibrary} style={styles.controlBtn}>
              <Ionicons name="images-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ── Preview step ─────────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        {imageUri && <Image source={{ uri: imageUri }} style={{ flex: 1 }} resizeMode="contain" />}
        {parsing ? (
          <View style={styles.parsingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: '#fff', marginTop: spacing.sm }}>Parsing with Claude AI…</Text>
          </View>
        ) : (
          <View style={styles.previewControls}>
            <Button mode="outlined" onPress={() => setStep('camera')} textColor="#fff" style={{ borderColor: 'rgba(255,255,255,0.4)' }}>
              Retake
            </Button>
            <Button mode="contained" onPress={handleParse}>Use This Photo</Button>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Form step ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.formHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>New Receipt</Text>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>Save</Button>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {imageUri && (
            <TouchableOpacity onPress={() => setStep('preview')}>
              <Image source={{ uri: imageUri }} style={styles.formThumb} resizeMode="cover" />
            </TouchableOpacity>
          )}

          <TextInput label="Date *" value={fields.date ?? ''} onChangeText={(v) => setFields((f) => ({ ...f, date: v }))}
            mode="outlined" style={styles.input} placeholder="YYYY-MM-DD" />

          <TextInput label="Merchant *" value={fields.merchant ?? ''} onChangeText={(v) => setFields((f) => ({ ...f, merchant: v }))}
            mode="outlined" style={styles.input} />

          <TextInput label="Amount *" value={fields.amount != null ? String(fields.amount) : ''}
            onChangeText={(v) => setFields((f) => ({ ...f, amount: parseFloat(v) || null }))}
            mode="outlined" keyboardType="decimal-pad" style={styles.input} left={<TextInput.Affix text="$" />} />

          <CategoryPicker
            value={(fields.suggested_category ?? 'Other') as ExpenseCategory}
            onChange={(cat) => setFields((f) => ({ ...f, suggested_category: cat }))}
          />

          <TextInput label="Purpose / Description" value={fields.purpose ?? ''} onChangeText={(v) => setFields((f) => ({ ...f, purpose: v }))}
            mode="outlined" style={styles.input} multiline numberOfLines={2} />

          <TextInput label="Card (last 4 digits)" value={fields.card_last_four ?? ''} onChangeText={(v) => setFields((f) => ({ ...f, card_last_four: v.slice(-4) }))}
            mode="outlined" style={styles.input} keyboardType="number-pad" maxLength={4} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: { width: 300, height: 200, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: radius.md, borderStyle: 'dashed' },
  overlayHint: { color: 'rgba(255,255,255,0.8)', marginTop: spacing.sm, fontSize: 13 },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  controlBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  shutterBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  parsingOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  previewControls: { flexDirection: 'row', justifyContent: 'space-around', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.8)' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  form: { padding: spacing.md, gap: spacing.xs, paddingBottom: 40 },
  formThumb: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.sm },
  input: { marginBottom: spacing.xs },
});
