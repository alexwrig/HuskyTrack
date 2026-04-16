import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, useTheme, Chip, Searchbar, Menu, FAB, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import { ReceiptCard } from '../../src/components/ReceiptCard';
import { SkeletonRow } from '../../src/components/SkeletonRow';
import { CategoryPurposeSheet } from '../../src/components/CategoryPurposeSheet';
import * as db from '../../src/services/database';
import { deleteReceiptImage } from '../../src/services/imageStorage';
import type { ExpenseCategory, Receipt } from '../../src/types';
import { EXPENSE_CATEGORIES } from '../../src/types';
import { spacing, radius } from '../../src/theme';

const SORT_OPTIONS = [
  { label: 'Date (newest)', sort_by: 'date', sort_order: 'desc' },
  { label: 'Date (oldest)', sort_by: 'date', sort_order: 'asc' },
  { label: 'Amount (high→low)', sort_by: 'amount', sort_order: 'desc' },
  { label: 'Amount (low→high)', sort_by: 'amount', sort_order: 'asc' },
  { label: 'Merchant (A–Z)', sort_by: 'merchant', sort_order: 'asc' },
] as const;

export default function ReceiptsScreen() {
  const theme = useTheme();
  const { receipts, isLoading, fetchReceipts, removeReceipt, updateReceipt } = useReceiptsStore();
  const [search, setSearch] = useState('');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | undefined>();
  const [sortIndex, setSortIndex] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetReceipt, setSheetReceipt] = useState<Receipt | null>(null);

  const sort = SORT_OPTIONS[sortIndex];

  const load = useCallback(() => {
    fetchReceipts({
      sort_by: sort.sort_by as 'date' | 'amount' | 'merchant',
      sort_order: sort.sort_order,
      category: filterCategory,
    });
  }, [sort, filterCategory]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    Alert.alert('Delete Receipt', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const receipt = receipts.find((r) => r.id === id);
            if (receipt?.image_uri) await deleteReceiptImage(receipt.image_uri).catch(() => {});
            await db.deleteReceipt(id);
            removeReceipt(id);
          } catch { Alert.alert('Error', 'Failed to delete receipt'); }
        },
      },
    ]);
  }

  function handleCategoryPress(receipt: Receipt) {
    setSheetReceipt(receipt);
    setSheetVisible(true);
  }

  async function handleSheetSave(
    id: string,
    category: ExpenseCategory,
    purposeSub: string,
    purposeDesc: string,
  ) {
    const updated = await db.updateReceipt(id, {
      category,
      purpose_sub: purposeSub || null,
      purpose: purposeSub === 'Other' ? (purposeDesc || null) : null,
    });
    if (updated) updateReceipt(updated);
  }

  const filtered = search
    ? receipts.filter((r) =>
        r.merchant.toLowerCase().includes(search.toLowerCase()) ||
        r.purpose?.toLowerCase().includes(search.toLowerCase()))
    : receipts;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={{ fontWeight: '800' }}>Receipts</Text>
        <View style={styles.headerActions}>
          <TouchableRipple onPress={() => router.push('/modals/scanner' as any)} style={styles.headerBtn} borderless>
            <Ionicons name="scan-outline" size={22} color={theme.colors.primary} />
          </TouchableRipple>
          <TouchableRipple onPress={() => router.push('/modals/batch-upload')} style={styles.headerBtn} borderless>
            <Ionicons name="layers-outline" size={22} color={theme.colors.primary} />
          </TouchableRipple>
          <TouchableRipple onPress={() => router.push('/modals/import')} style={styles.headerBtn} borderless>
            <Ionicons name="cloud-upload-outline" size={22} color={theme.colors.primary} />
          </TouchableRipple>
          <Menu
            visible={sortMenuVisible}
            onDismiss={() => setSortMenuVisible(false)}
            anchor={
              <TouchableRipple onPress={() => setSortMenuVisible(true)} style={styles.headerBtn} borderless>
                <Ionicons name="funnel-outline" size={22} color={theme.colors.primary} />
              </TouchableRipple>
            }
          >
            {SORT_OPTIONS.map((opt, i) => (
              <Menu.Item key={i} title={opt.label} trailingIcon={i === sortIndex ? 'check' : undefined}
                onPress={() => { setSortIndex(i); setSortMenuVisible(false); }} />
            ))}
          </Menu>
        </View>
      </View>

      <Searchbar placeholder="Search merchant or purpose…" value={search} onChangeText={setSearch}
        style={[styles.search, { backgroundColor: theme.colors.surface }]} inputStyle={{ fontSize: 14 }} />

      <FlatList
        horizontal showsHorizontalScrollIndicator={false}
        data={[undefined, ...EXPENSE_CATEGORIES]}
        keyExtractor={(item) => item ?? 'all'}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.xs, paddingVertical: spacing.xs }}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <Chip selected={filterCategory === item} onPress={() => setFilterCategory(item)} compact>
            {item ?? 'All'}
          </Chip>
        )}
      />

      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: spacing.md, marginBottom: spacing.xs }}>
        {filtered.length} expense{filtered.length !== 1 ? 's' : ''}{filterCategory ? ` · ${filterCategory}` : ''}
      </Text>

      {isLoading && receipts.length === 0
        ? <View>{[0,1,2,3,4].map((i) => <SkeletonRow key={i} lines={2} />)}</View>
        : (
          <FlatList
            data={filtered}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <ReceiptCard
                receipt={item}
                onEdit={(r) => router.push({ pathname: '/modals/edit-receipt', params: { id: r.id } })}
                onDelete={handleDelete}
                onViewImage={(uri) => router.push({ pathname: '/modals/edit-receipt', params: { viewUri: uri } })}
                onCategoryPress={handleCategoryPress}
              />
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="receipt-outline" size={48} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: spacing.md }}>No receipts found</Text>
              </View>
            }
          />
        )}

      <FAB icon="plus" style={[styles.fab, { backgroundColor: theme.colors.primary }]} color="#fff"
        onPress={() => router.push('/modals/capture')} />

      <CategoryPurposeSheet
        visible={sheetVisible}
        receipt={sheetReceipt}
        onDismiss={() => setSheetVisible(false)}
        onSave={handleSheetSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  headerBtn: { padding: spacing.xs, borderRadius: radius.sm },
  search: { marginHorizontal: spacing.md, marginBottom: spacing.xs, borderRadius: radius.md, elevation: 0 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.xl, borderRadius: 9999 },
});
