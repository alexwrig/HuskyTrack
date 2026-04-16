import { useState, useCallback } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity,
  Alert, ScrollView, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import {
  Text, useTheme, Button, Surface, TextInput,
  ActivityIndicator, ProgressBar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { parseReceiptImage } from '../../src/services/anthropic';
import { saveReceiptImage } from '../../src/services/imageStorage';
import * as db from '../../src/services/database';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import { CategoryPicker } from '../../src/components/CategoryPicker';
import { PurposePicker } from '../../src/components/PurposePicker';
import type { ExpenseCategory } from '../../src/types';
import { SUB_PURPOSE_MAP } from '../../src/types';
import { spacing, radius, palette } from '../../src/theme';

type Phase = 'pick' | 'queue' | 'review' | 'summary';
type FileStatus = 'pending' | 'parsing' | 'done' | 'error';

interface BatchItem {
  id: string;
  name: string;
  uri: string;
  mime: string;
  base64: string | null;
  status: FileStatus;
  errorMsg: string;
  // editable review fields
  date: string;
  merchant: string;
  amount: string;
  category: ExpenseCategory;
  purposeSub: string;
  purposeDesc: string;
  cardLast4: string;
  confirmed: boolean;
  skipped: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const STATUS_ICONS: Record<FileStatus, { name: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  pending: { name: 'time-outline', color: '#6b7280' },
  parsing: { name: 'sync-outline', color: '#f59e0b' },
  done: { name: 'checkmark-circle', color: '#10b981' },
  error: { name: 'alert-circle', color: '#ef4444' },
};

export default function BatchUploadModal() {
  const theme = useTheme();
  const { addReceipt } = useReceiptsStore();

  const [phase, setPhase] = useState<Phase>('pick');
  const [items, setItems] = useState<BatchItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function updateItem(id: string, patch: Partial<BatchItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  // ── Pick phase ─────────────────────────────────────────────────────────────

  async function pickImages() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    const newItems: BatchItem[] = result.assets.map((asset) => {
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      return makeItem(asset.uri, asset.fileName ?? `image_${Date.now()}`, asset.base64 ?? null,
        ext === 'png' ? 'image/png' : 'image/jpeg');
    });
    setItems((prev) => [...prev, ...newItems]);
  }

  async function pickPdfs() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const newItems: BatchItem[] = await Promise.all(
      (result.assets ?? []).map(async (asset) => {
        let base64: string | null = null;
        try {
          base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: 'base64' as FileSystem.EncodingType,
          });
        } catch { /* will retry at parse time */ }
        return makeItem(asset.uri, asset.name, base64, 'application/pdf');
      }),
    );
    setItems((prev) => [...prev, ...newItems]);
  }

  function makeItem(uri: string, name: string, base64: string | null, mime: string): BatchItem {
    return {
      id: Crypto.randomUUID(),
      name,
      uri,
      mime,
      base64,
      status: 'pending',
      errorMsg: '',
      date: new Date().toISOString().slice(0, 10),
      merchant: '',
      amount: '',
      category: 'Other',
      purposeSub: '',
      purposeDesc: '',
      cardLast4: '',
      confirmed: false,
      skipped: false,
    };
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // ── Queue / parsing phase ──────────────────────────────────────────────────

  async function startProcessing() {
    if (items.length === 0) { Alert.alert('No files', 'Add at least one image or PDF.'); return; }
    setPhase('queue');

    const MAX_CONCURRENT = 3;
    const queue = [...items];

    async function processOne(item: BatchItem) {
      updateItem(item.id, { status: 'parsing' });
      try {
        let base64 = item.base64;
        if (!base64) {
          base64 = await FileSystem.readAsStringAsync(item.uri, {
            encoding: 'base64' as FileSystem.EncodingType,
          });
        }
        const parsed = await parseReceiptImage(base64, item.mime);
        updateItem(item.id, {
          status: 'done',
          base64,
          date: parsed.date ?? new Date().toISOString().slice(0, 10),
          merchant: parsed.merchant ?? '',
          amount: parsed.amount != null ? String(parsed.amount) : '',
          category: (parsed.suggested_category ?? 'Other') as ExpenseCategory,
          purposeSub: parsed.suggested_purpose ?? '',
          purposeDesc: parsed.suggested_description ?? '',
          cardLast4: parsed.card_last_four ?? '',
        });
      } catch (err) {
        updateItem(item.id, { status: 'error', errorMsg: err instanceof Error ? err.message : 'Failed' });
      }
    }

    // Process in batches of MAX_CONCURRENT
    for (let i = 0; i < queue.length; i += MAX_CONCURRENT) {
      const batch = queue.slice(i, i + MAX_CONCURRENT);
      await Promise.all(batch.map(processOne));
    }

    setReviewIndex(0);
    setPhase('review');
  }

  // ── Review phase ───────────────────────────────────────────────────────────

  const reviewable = items.filter((it) => it.status === 'done');
  const currentItem = reviewable[reviewIndex];

  function confirmCurrent() {
    if (!currentItem) return;
    if (!currentItem.merchant || !currentItem.amount || !currentItem.date) {
      Alert.alert('Missing fields', 'Date, merchant, and amount are required.');
      return;
    }
    updateItem(currentItem.id, { confirmed: true });
    advanceReview();
  }

  function skipCurrent() {
    if (!currentItem) return;
    updateItem(currentItem.id, { skipped: true });
    advanceReview();
  }

  function advanceReview() {
    if (reviewIndex + 1 >= reviewable.length) {
      setPhase('summary');
    } else {
      setReviewIndex((i) => i + 1);
    }
  }

  // ── Summary / save phase ───────────────────────────────────────────────────

  const confirmed = items.filter((it) => it.confirmed);

  async function saveAll() {
    setSaving(true);
    let saved = 0;
    try {
      for (const item of confirmed) {
        const savedUri = await saveReceiptImage(item.uri).catch(() => null);
        await db.createReceipt({
          date: item.date,
          merchant: item.merchant,
          amount: parseFloat(item.amount) || 0,
          category: item.category,
          purpose_sub: item.purposeSub || null,
          purpose: item.purposeSub === 'Other' ? (item.purposeDesc || null) : null,
          card_last_four: item.cardLast4 || null,
          image_uri: savedUri,
        }).then((r) => { addReceipt(r); saved++; });
      }
      Alert.alert('Saved', `${saved} receipt${saved !== 1 ? 's' : ''} added.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'pick') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>Batch Upload</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.pickBtns}>
          <TouchableOpacity style={[styles.pickCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]} onPress={pickImages}>
            <Ionicons name="images" size={36} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: '600', marginTop: spacing.sm }}>Images</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>Select multiple photos from your library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pickCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]} onPress={pickPdfs}>
            <Ionicons name="document-text" size={36} color={theme.colors.error} />
            <Text variant="titleSmall" style={{ fontWeight: '600', marginTop: spacing.sm }}>PDFs</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>Import PDF receipts from Files or Mail</Text>
          </TouchableOpacity>
        </View>

        {items.length > 0 && (
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing.md }}
            renderItem={({ item }) => (
              <View style={[styles.queueRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
                <Ionicons name={item.mime === 'application/pdf' ? 'document-text' : 'image'} size={20} color={theme.colors.primary} />
                <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1, marginHorizontal: spacing.sm }}>{item.name}</Text>
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        {items.length > 0 && (
          <View style={styles.bottomBar}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{items.length} file{items.length !== 1 ? 's' : ''} selected</Text>
            <Button mode="contained" onPress={startProcessing} icon="play">Parse All</Button>
          </View>
        )}
      </SafeAreaView>
    );
  }

  if (phase === 'queue') {
    const done = items.filter((it) => it.status === 'done' || it.status === 'error').length;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={styles.header}>
          <View style={{ width: 24 }} />
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>Processing...</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
          <ProgressBar progress={done / items.length} color={theme.colors.primary} style={{ height: 6, borderRadius: 3 }} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: spacing.xs }}>{done} of {items.length} processed</Text>
        </View>
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingHorizontal: spacing.md }}
          renderItem={({ item }) => {
            const icon = STATUS_ICONS[item.status];
            return (
              <View style={[styles.queueRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
                {item.status === 'parsing'
                  ? <ActivityIndicator size={18} />
                  : <Ionicons name={icon.name} size={18} color={icon.color} />}
                <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1, marginHorizontal: spacing.sm }}>{item.name}</Text>
                <Text variant="labelSmall" style={{ color: icon.color, textTransform: 'capitalize' }}>{item.status}</Text>
              </View>
            );
          }}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'review' && currentItem) {
    const isPdf = currentItem.mime === 'application/pdf';
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <Button onPress={skipCurrent} textColor={theme.colors.error}>Skip</Button>
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>
              {reviewIndex + 1} of {reviewable.length}
            </Text>
            <Button mode="contained" onPress={confirmCurrent}>Confirm</Button>
          </View>

          <ProgressBar progress={(reviewIndex + 1) / reviewable.length} color={theme.colors.primary} style={{ height: 4 }} />

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {isPdf ? (
              <View style={[styles.pdfBanner, { backgroundColor: theme.colors.errorContainer }]}>
                <Ionicons name="document-text" size={20} color={theme.colors.error} />
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginLeft: spacing.xs }}>{currentItem.name}</Text>
              </View>
            ) : (
              <Image source={{ uri: currentItem.uri }} style={styles.reviewThumb} resizeMode="cover" />
            )}

            <TextInput label="Date *" value={currentItem.date}
              onChangeText={(v) => updateItem(currentItem.id, { date: v })}
              mode="outlined" style={styles.input} placeholder="YYYY-MM-DD" />

            <TextInput label="Merchant *" value={currentItem.merchant}
              onChangeText={(v) => updateItem(currentItem.id, { merchant: v })}
              mode="outlined" style={styles.input} />

            <TextInput label="Amount *" value={currentItem.amount}
              onChangeText={(v) => updateItem(currentItem.id, { amount: v })}
              mode="outlined" keyboardType="decimal-pad" style={styles.input}
              left={<TextInput.Affix text="$" />} />

            <CategoryPicker
              value={currentItem.category}
              onChange={(cat) => {
                const opts = SUB_PURPOSE_MAP[cat];
                const keepSub = opts.includes(currentItem.purposeSub as typeof opts[number]) ? currentItem.purposeSub : '';
                updateItem(currentItem.id, { category: cat, purposeSub: keepSub });
              }}
            />

            <PurposePicker
              category={currentItem.category}
              purposeSub={currentItem.purposeSub}
              description={currentItem.purposeDesc}
              onChangeSub={(sub) => updateItem(currentItem.id, { purposeSub: sub })}
              onChangeDescription={(desc) => updateItem(currentItem.id, { purposeDesc: desc })}
            />

            <TextInput label="Card (last 4)" value={currentItem.cardLast4}
              onChangeText={(v) => updateItem(currentItem.id, { cardLast4: v.slice(-4) })}
              mode="outlined" keyboardType="number-pad" maxLength={4} style={styles.input} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (phase === 'summary') {
    const skipped = items.filter((it) => it.skipped).length;
    const errors = items.filter((it) => it.status === 'error').length;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>Summary</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>
          <View style={styles.summaryStats}>
            <Surface style={[styles.statBox, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Text variant="headlineMedium" style={{ fontWeight: '800', color: palette.success }}>{confirmed.length}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Confirmed</Text>
            </Surface>
            <Surface style={[styles.statBox, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Text variant="headlineMedium" style={{ fontWeight: '800', color: palette.warning }}>{skipped}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Skipped</Text>
            </Surface>
            <Surface style={[styles.statBox, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Text variant="headlineMedium" style={{ fontWeight: '800', color: palette.error }}>{errors}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Errors</Text>
            </Surface>
          </View>

          {confirmed.map((item) => (
            <Surface key={item.id} style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '600', flex: 1 }}>{item.merchant || '—'}</Text>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.primary }}>
                  {item.amount ? fmt(parseFloat(item.amount)) : '—'}
                </Text>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {item.date} · {item.category}{item.purposeSub ? ` · ${item.purposeSub}` : ''}
              </Text>
            </Surface>
          ))}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Button mode="outlined" onPress={() => router.back()} style={{ flex: 1 }}>Discard</Button>
          <Button mode="contained" onPress={saveAll} loading={saving} disabled={saving || confirmed.length === 0}
            style={{ flex: 1 }} icon="content-save">
            Save {confirmed.length} Receipt{confirmed.length !== 1 ? 's' : ''}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pickBtns: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  pickCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, alignItems: 'center', gap: spacing.xs },
  queueRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, padding: spacing.sm, marginBottom: spacing.xs },
  form: { padding: spacing.md, gap: spacing.xs, paddingBottom: 40 },
  reviewThumb: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.sm },
  input: { marginBottom: spacing.xs },
  pdfBanner: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm },
  summaryStats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statBox: { flex: 1, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: 4 },
  summaryCard: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, gap: 4 },
  bottomBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.lg },
});
