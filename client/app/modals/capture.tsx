import { useState, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, Image,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text, useTheme, Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { parseReceiptImage } from '../../src/services/anthropic';
import { saveReceiptImage } from '../../src/services/imageStorage';
import * as db from '../../src/services/database';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import { CategoryPicker } from '../../src/components/CategoryPicker';
import { PurposePicker } from '../../src/components/PurposePicker';
import type { ExpenseCategory, ParsedReceiptFields } from '../../src/types';
import { SUB_PURPOSE_MAP } from '../../src/types';
import { spacing, radius } from '../../src/theme';

type Step = 'camera' | 'preview' | 'form';

export default function CaptureModal() {
  const theme = useTheme();
  const { addReceipt } = useReceiptsStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>('camera');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fields, setFields] = useState<ParsedReceiptFields>({
    date: new Date().toISOString().slice(0, 10),
    merchant: null, amount: null, suggested_category: null,
    suggested_purpose: null, suggested_description: null, card_last_four: null,
  });
  const [amountText, setAmountText] = useState('');
  const [purposeSub, setPurposeSub] = useState('');
  const [purposeDesc, setPurposeDesc] = useState('');

  function syncPurposeToCategory(cat: ExpenseCategory, currentSub: string) {
    const opts = SUB_PURPOSE_MAP[cat];
    if (!opts.includes(currentSub as typeof opts[number])) {
      setPurposeSub('');
    }
  }

  async function handleCapture() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8, base64: true });
      if (photo?.uri) {
        setImageUri(photo.uri);
        setImageBase64(photo.base64 ?? null);
        setImageMime('image/jpeg');
        setStep('preview');
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo');
    }
  }

  async function handlePickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setImageBase64(asset.base64 ?? null);
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      setImageMime(ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
      setStep('preview');
    }
  }

  async function handlePickPdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: 'base64' as FileSystem.EncodingType,
        });
        setImageUri(asset.uri);
        setImageBase64(base64);
        setImageMime('application/pdf');
        // PDFs go straight to form — no visual preview
        setStep('form');
      }
    } catch {
      Alert.alert('Error', 'Failed to pick PDF');
    }
  }

  async function handleParse() {
    if (!imageBase64) {
      Alert.alert('No image data', 'Please retake or re-select the photo.');
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseReceiptImage(imageBase64, imageMime);
      setFields({
        date: parsed.date ?? new Date().toISOString().slice(0, 10),
        merchant: parsed.merchant,
        amount: parsed.amount,
        suggested_category: parsed.suggested_category,
        suggested_purpose: parsed.suggested_purpose,
        suggested_description: parsed.suggested_description,
        card_last_four: parsed.card_last_four,
      });
      setAmountText(parsed.amount != null ? String(parsed.amount) : '');
      if (parsed.suggested_purpose) setPurposeSub(parsed.suggested_purpose);
      if (parsed.suggested_description) setPurposeDesc(parsed.suggested_description);
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
      const savedUri = imageUri ? await saveReceiptImage(imageUri) : null;
      const receipt = await db.createReceipt({
        date: fields.date!,
        merchant: fields.merchant!,
        amount: fields.amount!,
        category: (fields.suggested_category ?? 'Other') as ExpenseCategory,
        purpose_sub: purposeSub || null,
        purpose: purposeSub === 'Other' ? (purposeDesc || null) : null,
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
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.controlBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCapture} style={styles.shutterBtn}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
            <View style={styles.rightControls}>
              <TouchableOpacity onPress={() => router.replace('/modals/scanner' as any)} style={styles.controlBtn}>
                <Ionicons name="scan-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickFromLibrary} style={styles.controlBtn}>
                <Ionicons name="images-outline" size={26} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickPdf} style={[styles.controlBtn, { marginTop: spacing.xs }]}>
                <Ionicons name="document-text-outline" size={22} color="#fff" />
                <Text style={styles.pdfBtnLabel}>PDF</Text>
              </TouchableOpacity>
            </View>
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
            <Text style={{ color: '#fff', marginTop: spacing.sm }}>Parsing with Claude AI...</Text>
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
  const currentCategory = (fields.suggested_category ?? 'Other') as ExpenseCategory;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.formHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>
            {imageMime === 'application/pdf' ? 'New Receipt (PDF)' : 'New Receipt'}
          </Text>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>Save</Button>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {imageUri && imageMime !== 'application/pdf' && (
            <TouchableOpacity onPress={() => setStep('preview')}>
              <Image source={{ uri: imageUri }} style={styles.formThumb} resizeMode="cover" />
            </TouchableOpacity>
          )}
          {imageMime === 'application/pdf' && (
            <View style={[styles.pdfBanner, { backgroundColor: theme.colors.errorContainer }]}>
              <Ionicons name="document-text" size={20} color={theme.colors.error} />
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginLeft: spacing.xs }}>PDF receipt attached</Text>
            </View>
          )}

          <TextInput label="Date *" value={fields.date ?? ''} onChangeText={(v) => setFields((f) => ({ ...f, date: v }))}
            mode="outlined" style={styles.input} placeholder="YYYY-MM-DD" />

          <TextInput label="Merchant *" value={fields.merchant ?? ''} onChangeText={(v) => setFields((f) => ({ ...f, merchant: v }))}
            mode="outlined" style={styles.input} />

          <TextInput label="Amount *" value={amountText}
            onChangeText={(v) => { setAmountText(v); setFields((f) => ({ ...f, amount: parseFloat(v) || null })); }}
            mode="outlined" keyboardType="decimal-pad" style={styles.input} left={<TextInput.Affix text="$" />} />

          <CategoryPicker
            value={currentCategory}
            onChange={(cat) => {
              setFields((f) => ({ ...f, suggested_category: cat }));
              syncPurposeToCategory(cat, purposeSub);
            }}
          />

          <PurposePicker
            category={currentCategory}
            purposeSub={purposeSub}
            description={purposeDesc}
            onChangeSub={setPurposeSub}
            onChangeDescription={setPurposeDesc}
          />

          <TextInput label="Card (last 4 digits)" value={fields.card_last_four ?? ''}
            onChangeText={(v) => setFields((f) => ({ ...f, card_last_four: v.slice(-4) }))}
            mode="outlined" style={styles.input} keyboardType="number-pad" maxLength={4} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: { width: 240, height: 380, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: radius.md, borderStyle: 'dashed' },
  overlayHint: { color: 'rgba(255,255,255,0.8)', marginTop: spacing.sm, fontSize: 13 },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  controlBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  rightControls: { alignItems: 'center', gap: 2 },
  pdfBtnLabel: { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  shutterBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  parsingOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  previewControls: { flexDirection: 'row', justifyContent: 'space-around', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.8)' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  form: { padding: spacing.md, gap: spacing.xs, paddingBottom: 40 },
  formThumb: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.sm },
  pdfBanner: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm },
  input: { marginBottom: spacing.xs },
});
