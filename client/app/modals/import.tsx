import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, useTheme, Button, DataTable, ActivityIndicator, Menu } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { Ionicons } from '@expo/vector-icons';
import * as db from '../../src/services/database';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import type { ExpenseCategory } from '../../src/types';
import { EXPENSE_CATEGORIES, QUALIFIED_CATEGORIES } from '../../src/types';
import { spacing, radius } from '../../src/theme';

type ColumnMapping = {
  date?: string; merchant?: string; amount?: string;
  category?: string; purpose?: string; card_last_four?: string;
};

const FIELDS: (keyof ColumnMapping)[] = ['date', 'merchant', 'amount', 'category', 'purpose', 'card_last_four'];

type Step = 'upload' | 'map' | 'result';

interface ImportResult { imported: number; duplicates: number; errors: { row: number; message: string }[]; }

export default function ImportModal() {
  const theme = useTheme();
  const { fetchReceipts } = useReceiptsStore();

  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Record<string, unknown>[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  async function handlePickFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/csv'],
    });
    if (res.canceled || !res.assets?.[0]) return;

    setLoading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(res.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, dateNF: 'YYYY-MM-DD' });

      if (rows.length === 0) { Alert.alert('Empty file', 'No rows found.'); return; }

      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setSample(rows.slice(0, 3));
      setRawRows(rows);

      // Auto-map obvious column names
      const auto: ColumnMapping = {};
      for (const field of FIELDS) {
        const match = hdrs.find((h) => h.toLowerCase().replace(/[^a-z]/g, '') === field.replace('_', ''));
        if (match) auto[field] = match;
      }
      setMapping(auto);
      setStep('map');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not read file');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    setLoading(true);
    const res: ImportResult = { imported: 0, duplicates: 0, errors: [] };

    try {
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        try {
          const date = String(row[mapping.date ?? ''] ?? row['Date'] ?? row['date'] ?? '').trim();
          const merchant = String(row[mapping.merchant ?? ''] ?? row['Merchant'] ?? row['merchant'] ?? '').trim();
          const rawAmt = row[mapping.amount ?? ''] ?? row['Amount'] ?? row['amount'] ?? 0;
          const amount = parseFloat(String(rawAmt).replace(/[^0-9.]/g, ''));

          if (!date || !merchant || isNaN(amount)) {
            res.errors.push({ row: i + 2, message: 'Missing date, merchant, or amount' });
            continue;
          }

          const exists = await db.receiptExists(date, merchant, amount);
          if (exists) { res.duplicates++; continue; }

          const rawCat = String(row[mapping.category ?? ''] ?? row['Category'] ?? 'Other').trim();
          const category = (EXPENSE_CATEGORIES as readonly string[]).includes(rawCat) ? rawCat as ExpenseCategory : 'Other';
          const purpose = String(row[mapping.purpose ?? ''] ?? row['Purpose'] ?? '').trim() || null;
          const cardRaw = String(row[mapping.card_last_four ?? ''] ?? row['Card'] ?? '').replace(/\D/g, '');
          const card_last_four = cardRaw.slice(-4) || null;

          await db.createReceipt({ date, merchant, amount, category, purpose, card_last_four, image_uri: null });
          res.imported++;
        } catch (err) {
          res.errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      setResult(res);
      setStep('result');
      await fetchReceipts();
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text variant="titleMedium" style={{ fontWeight: '700' }}>Import Spreadsheet</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Upload */}
        {step === 'upload' && (
          <View style={styles.uploadArea}>
            <Ionicons name="cloud-upload-outline" size={64} color={theme.colors.primary} />
            <Text variant="titleMedium" style={{ fontWeight: '600', marginTop: spacing.md }}>Upload .xlsx or .csv</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.xs }}>
              Map your columns, then import. Duplicates (same date + merchant + amount) are automatically skipped.
            </Text>
            {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} /> : (
              <Button mode="contained" onPress={handlePickFile} style={{ marginTop: spacing.xl }} icon="folder-open">Choose File</Button>
            )}
          </View>
        )}

        {/* Map */}
        {step === 'map' && (
          <View>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: spacing.md, marginBottom: spacing.md }}>
              Map each EduTrack field to a column from your file. * fields are required.
            </Text>

            {FIELDS.map((field) => (
              <View key={field} style={[styles.mapRow, { borderColor: theme.colors.outline }]}>
                <Text variant="labelLarge" style={{ flex: 1, textTransform: 'capitalize' }}>
                  {field.replace('_', ' ')}{['date','merchant','amount'].includes(field) ? ' *' : ''}
                </Text>
                <Menu
                  visible={openMenu === field}
                  onDismiss={() => setOpenMenu(null)}
                  anchor={
                    <TouchableOpacity onPress={() => setOpenMenu(field)} style={[styles.mapSelect, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1 }}>{mapping[field] ?? '— select —'}</Text>
                      <Ionicons name="chevron-down" size={14} color={theme.colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  }
                >
                  <Menu.Item title="— skip —" onPress={() => { setMapping((m) => { const n = {...m}; delete n[field]; return n; }); setOpenMenu(null); }} />
                  {headers.map((h) => (
                    <Menu.Item key={h} title={h} trailingIcon={mapping[field] === h ? 'check' : undefined}
                      onPress={() => { setMapping((m) => ({ ...m, [field]: h })); setOpenMenu(null); }} />
                  ))}
                </Menu>
              </View>
            ))}

            {sample.length > 0 && (
              <View style={{ marginTop: spacing.lg }}>
                <Text variant="labelMedium" style={{ paddingHorizontal: spacing.md, marginBottom: spacing.xs, color: theme.colors.onSurfaceVariant }}>PREVIEW (first 3 rows)</Text>
                <ScrollView horizontal>
                  <DataTable>
                    <DataTable.Header>{headers.map((h) => <DataTable.Title key={h} style={{ minWidth: 100 }}>{h}</DataTable.Title>)}</DataTable.Header>
                    {sample.map((row, i) => (
                      <DataTable.Row key={i}>{headers.map((h) => <DataTable.Cell key={h} style={{ minWidth: 100 }}>{String(row[h] ?? '')}</DataTable.Cell>)}</DataTable.Row>
                    ))}
                  </DataTable>
                </ScrollView>
              </View>
            )}

            <View style={styles.mapActions}>
              <Button mode="outlined" onPress={() => setStep('upload')}>Back</Button>
              <Button mode="contained" onPress={handleImport} loading={loading}
                disabled={loading || !mapping.date || !mapping.merchant || !mapping.amount}>
                Import {rawRows.length} rows
              </Button>
            </View>
          </View>
        )}

        {/* Result */}
        {step === 'result' && result && (
          <View style={styles.result}>
            <Ionicons name={result.errors.length === 0 ? 'checkmark-circle' : 'warning'} size={64}
              color={result.errors.length === 0 ? '#10b981' : '#f59e0b'} />
            <Text variant="headlineSmall" style={{ fontWeight: '700', marginTop: spacing.md }}>Import Complete</Text>
            <Text variant="bodyLarge" style={{ marginTop: spacing.sm }}>{result.imported} records imported</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{result.duplicates} duplicates skipped</Text>
            {result.errors.length > 0 && (
              <View style={[styles.errorBox, { backgroundColor: theme.colors.errorContainer }]}>
                <Text variant="labelMedium" style={{ fontWeight: '700', marginBottom: spacing.xs }}>{result.errors.length} row(s) had errors:</Text>
                {result.errors.slice(0, 5).map((e) => <Text key={e.row} variant="bodySmall">Row {e.row}: {e.message}</Text>)}
              </View>
            )}
            <Button mode="contained" onPress={() => router.back()} style={{ marginTop: spacing.xl }}>Done</Button>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  scroll: { flexGrow: 1, paddingBottom: 40 },
  uploadArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, minHeight: 400 },
  mapRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 0.5 },
  mapSelect: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, minWidth: 160, maxWidth: 200 },
  mapActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.lg, gap: spacing.sm },
  result: { alignItems: 'center', padding: spacing.xl, minHeight: 400, justifyContent: 'center' },
  errorBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, width: '100%' },
});
