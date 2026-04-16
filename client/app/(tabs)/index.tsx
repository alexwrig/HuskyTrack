import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Text, useTheme, Surface, FAB } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import { ReceiptCard } from '../../src/components/ReceiptCard';
import { SkeletonRow } from '../../src/components/SkeletonRow';
import * as db from '../../src/services/database';
import { deleteReceiptImage } from '../../src/services/imageStorage';
import type { MD3Theme } from 'react-native-paper';
import { spacing, radius, palette } from '../../src/theme';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function thisMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export default function HomeScreen() {
  const theme = useTheme();
  const { receipts, isLoading, fetchReceipts, removeReceipt } = useReceiptsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [monthTotal, setMonthTotal] = useState(0);

  const { start, end } = thisMonthRange();
  const month = new Date().toLocaleString('default', { month: 'long' });

  useEffect(() => {
    fetchReceipts({ sort_by: 'date', sort_order: 'desc' });
  }, []);

  useEffect(() => {
    const total = receipts
      .filter((r) => r.date >= start && r.date <= end && r.is_qualified)
      .reduce((s, r) => s + r.amount, 0);
    setMonthTotal(total);
  }, [receipts]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchReceipts({ sort_by: 'date', sort_order: 'desc' });
    setRefreshing(false);
  }

  async function handleDelete(id: string) {
    const receipt = receipts.find((r) => r.id === id);
    if (receipt?.image_uri) await deleteReceiptImage(receipt.image_uri).catch(() => {});
    await db.deleteReceipt(id);
    removeReceipt(id);
  }

  const recent = receipts.slice(0, 5);
  const thisMonthCount = receipts.filter((r) => r.date >= start && r.date <= end).length;
  const unqualified = receipts.filter((r) => r.date >= start && r.date <= end && !r.is_qualified).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text variant="headlineSmall" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
            EduTrack
          </Text>
          <TouchableOpacity onPress={() => router.push('/modals/capture')}>
            <Ionicons name="camera-outline" size={28} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Monthly summary */}
        <Surface style={[styles.summaryCard, { backgroundColor: theme.colors.primary }]} elevation={2}>
          <Text style={styles.summaryLabel}>Qualified Expenses — {month}</Text>
          <Text style={styles.summaryAmount}>{fmt(monthTotal)}</Text>
          <Text style={styles.summarySubtitle}>529 qualified expenses this month</Text>
        </Surface>

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <StatCard icon="receipt-outline" label="This Month" value={String(thisMonthCount)} suffix="receipts" theme={theme} />
          <StatCard icon="warning-outline" label="Unqualified" value={String(unqualified)} suffix="flagged" theme={theme} accentColor={palette.warning} />
        </View>

        {/* Recent */}
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/receipts')}>
            <Text style={{ color: theme.colors.primary, fontSize: 14 }}>See all</Text>
          </TouchableOpacity>
        </View>

        {isLoading
          ? [0, 1, 2].map((i) => <SkeletonRow key={i} lines={2} />)
          : recent.length === 0
          ? <EmptyState onCapture={() => router.push('/modals/capture')} theme={theme} />
          : recent.map((r) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                onEdit={(rx) => router.push({ pathname: '/modals/edit-receipt', params: { id: rx.id } })}
                onDelete={handleDelete}
                onViewImage={(uri) => router.push({ pathname: '/modals/edit-receipt', params: { viewUri: uri } })}
              />
            ))}
      </ScrollView>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#fff"
        onPress={() => router.push('/modals/capture')}
      />
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, suffix, theme, accentColor }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; value: string; suffix: string;
  theme: MD3Theme; accentColor?: string;
}) {
  return (
    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <Ionicons name={icon} size={22} color={accentColor ?? theme.colors.primary} />
      <Text variant="headlineSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{value}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{suffix}</Text>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
    </Surface>
  );
}

function EmptyState({ onCapture, theme }: { onCapture: () => void; theme: MD3Theme }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="receipt-outline" size={64} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium" style={{ fontWeight: '600', marginTop: spacing.md }}>No expenses yet</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.xs }}>
        Tap the camera icon or + button to scan your first receipt.
      </Text>
      <TouchableOpacity onPress={onCapture} style={[styles.emptyBtn, { backgroundColor: theme.colors.primary }]}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Scan Receipt</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  summaryCard: { marginHorizontal: spacing.md, marginVertical: spacing.sm, borderRadius: radius.xl, padding: spacing.lg },
  summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
  summaryAmount: { color: '#fff', fontSize: 38, fontWeight: '800', marginVertical: spacing.xs },
  summarySubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  statCard: { flex: 1, borderRadius: radius.lg, padding: spacing.md, gap: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyBtn: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.xl, borderRadius: radius.full },
});
