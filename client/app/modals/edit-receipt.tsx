import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Image, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, useTheme, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as db from '../../src/services/database';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import { CategoryPicker } from '../../src/components/CategoryPicker';
import { PurposePicker } from '../../src/components/PurposePicker';
import type { Receipt, ExpenseCategory } from '../../src/types';
import { SUB_PURPOSE_MAP } from '../../src/types';
import { spacing, radius } from '../../src/theme';

export default function EditReceiptModal() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string; viewUri?: string }>();
  const { receipts, updateReceipt: storeUpdate } = useReceiptsStore();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState('');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Other');
  const [purposeSub, setPurposeSub] = useState('');
  const [purposeDesc, setPurposeDesc] = useState('');
  const [cardLast4, setCardLast4] = useState('');

  // Image-only view mode
  if (params.viewUri && !params.id) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Image source={{ uri: params.viewUri }} style={{ flex: 1 }} resizeMode="contain" />
      </SafeAreaView>
    );
  }

  useEffect(() => {
    if (!params.id) { setLoading(false); return; }
    const cached = receipts.find((r) => r.id === params.id);
    if (cached) { populate(cached); setLoading(false); return; }
    db.getReceipt(params.id).then((r) => {
      if (r) populate(r);
      setLoading(false);
    });
  }, [params.id]);

  function populate(r: Receipt) {
    setReceipt(r);
    setDate(r.date);
    setMerchant(r.merchant);
    setAmount(String(r.amount));
    setCategory(r.category);
    setPurposeSub(r.purpose_sub ?? '');
    setPurposeDesc(r.purpose ?? '');
    setCardLast4(r.card_last_four ?? '');
  }

  function handleCategoryChange(cat: ExpenseCategory) {
    setCategory(cat);
    // Reset purpose_sub if it doesn't belong to new category
    const opts = SUB_PURPOSE_MAP[cat];
    if (!opts.includes(purposeSub as typeof opts[number])) {
      setPurposeSub('');
    }
  }

  async function handleSave() {
    if (!receipt || !date || !merchant || !amount) {
      Alert.alert('Missing fields', 'Date, merchant, and amount are required.');
      return;
    }
    setSaving(true);
    try {
      const updated = await db.updateReceipt(receipt.id, {
        date,
        merchant,
        amount: parseFloat(amount),
        category,
        purpose_sub: purposeSub || null,
        purpose: purposeSub === 'Other' ? (purposeDesc || null) : null,
        card_last_four: cardLast4 || null,
      });
      if (updated) storeUpdate(updated);
      router.back();
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>Edit Receipt</Text>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>Save</Button>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {receipt?.image_uri && !receipt.image_uri.toLowerCase().endsWith('.pdf') && (
            <TouchableOpacity onPress={() => router.push({ pathname: '/modals/edit-receipt', params: { viewUri: receipt.image_uri! } })}>
              <Image source={{ uri: receipt.image_uri }} style={styles.thumb} resizeMode="cover" />
            </TouchableOpacity>
          )}
          {receipt?.image_uri?.toLowerCase().endsWith('.pdf') && (
            <View style={[styles.pdfBanner, { backgroundColor: theme.colors.errorContainer }]}>
              <Ionicons name="document-text" size={20} color={theme.colors.error} />
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginLeft: spacing.xs }}>PDF receipt attached</Text>
            </View>
          )}

          <TextInput label="Date" value={date} onChangeText={setDate} mode="outlined" style={styles.input} placeholder="YYYY-MM-DD" />
          <TextInput label="Merchant" value={merchant} onChangeText={setMerchant} mode="outlined" style={styles.input} />
          <TextInput label="Amount" value={amount} onChangeText={setAmount} mode="outlined" keyboardType="decimal-pad" style={styles.input} left={<TextInput.Affix text="$" />} />

          <CategoryPicker value={category} onChange={handleCategoryChange} />

          <PurposePicker
            category={category}
            purposeSub={purposeSub}
            description={purposeDesc}
            onChangeSub={setPurposeSub}
            onChangeDescription={setPurposeDesc}
          />

          <TextInput label="Card (last 4)" value={cardLast4} onChangeText={setCardLast4} mode="outlined" keyboardType="number-pad" maxLength={4} style={styles.input} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 56, left: spacing.md, zIndex: 10, padding: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  form: { padding: spacing.md, paddingBottom: 40 },
  thumb: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.md },
  pdfBanner: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.md },
  input: { marginBottom: spacing.sm },
});
