import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Alert } from 'react-native';
import { Text, useTheme, Button, Surface, SegmentedButtons, ProgressBar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import type { MD3Theme } from 'react-native-paper';
import * as db from '../../src/services/database';
import { exportPdf } from '../../src/services/pdfExport';
import { exportXlsx } from '../../src/services/xlsxExport';
import { listReceipts } from '../../src/services/database';
import { getCoa } from '../../src/services/coaStorage';
import { SkeletonRow } from '../../src/components/SkeletonRow';
import { CategoryBadge, CATEGORY_COLORS } from '../../src/components/CategoryBadge';
import type { ReportSummary, ExpenseCategory, CoaUtilization } from '../../src/types';
import { spacing, radius, palette } from '../../src/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Period = 'month' | 'quarter' | 'year' | 'all';

function getPeriodDates(period: Period) {
  const now = new Date();
  if (period === 'all') return { start: undefined, end: undefined };
  const end = now.toISOString().slice(0, 10);
  if (period === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end };
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10), end };
  }
  return { start: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), end };
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function ReportsScreen() {
  const theme = useTheme();
  const [period, setPeriod] = useState<Period>('year');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [coaUtil, setCoaUtil] = useState<CoaUtilization | null>(null);

  const { start, end } = getPeriodDates(period);

  useEffect(() => {
    setLoading(true);
    db.getReportSummary(start, end)
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));

    getCoa().then((coa) =>
      db.getCoaUtilization(coa, start, end).then(setCoaUtil).catch(console.error)
    );
  }, [period]);

  async function handleExportPdf() {
    if (!summary) return;
    setExporting(true);
    try {
      const receipts = await listReceipts({ start_date: start, end_date: end, sort_by: 'date', sort_order: 'asc' });
      await exportPdf(summary, receipts, 'Account Holder');
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  }

  async function handleExportXlsx() {
    setExporting(true);
    try {
      const receipts = await listReceipts({ start_date: start, end_date: end, sort_by: 'date', sort_order: 'asc' });
      await exportXlsx(receipts);
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  }

  const chartData = summary?.by_category.slice(0, 6) ?? [];
  const barData = {
    labels: chartData.map((c) => c.category.split(' ')[0]),
    datasets: [{ data: chartData.map((c) => c.total) }],
  };
  const pieData = chartData.map((c) => ({
    name: c.category,
    amount: c.total,
    color: CATEGORY_COLORS[c.category as ExpenseCategory] ?? '#6b7280',
    legendFontColor: theme.colors.onSurface,
    legendFontSize: 11,
  }));
  const chartConfig = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 0,
    color: () => palette.primary,
    labelColor: () => theme.colors.onSurfaceVariant,
    style: { borderRadius: radius.md },
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={{ fontWeight: '800' }}>Reports</Text>
        </View>

        <SegmentedButtons
          value={period}
          onValueChange={(v) => setPeriod(v as Period)}
          style={styles.segmented}
          buttons={[
            { value: 'month', label: 'Month' },
            { value: 'quarter', label: 'Quarter' },
            { value: 'year', label: 'Year' },
            { value: 'all', label: 'All Time' },
          ]}
        />

        {loading
          ? [0, 1, 2, 3].map((i) => <SkeletonRow key={i} lines={2} />)
          : summary && (
            <>
              <View style={styles.summaryRow}>
                <SummaryCard label="Total Qualified" value={fmt(summary.total_qualified)} icon="checkmark-circle" color={palette.success} theme={theme} />
                <SummaryCard label="Non-Qualified" value={fmt(summary.total_non_qualified)} icon="warning" color={palette.warning} theme={theme} />
              </View>

              {coaUtil && (coaUtil.tuition_limit > 0 || coaUtil.housing_food_limit > 0 || coaUtil.books_supplies_limit > 0) && (
                <Surface style={[styles.tableCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <Text variant="titleSmall" style={styles.chartTitle}>COA Budget Utilization</Text>
                  {coaUtil.tuition_limit > 0 && (
                    <CoaRow label="Tuition & Fees" spent={coaUtil.tuition_spent} limit={coaUtil.tuition_limit} theme={theme} />
                  )}
                  {coaUtil.housing_food_limit > 0 && (
                    <CoaRow label="Housing & Food" spent={coaUtil.housing_food_spent} limit={coaUtil.housing_food_limit} theme={theme} />
                  )}
                  {coaUtil.books_supplies_limit > 0 && (
                    <CoaRow label="Books & Supplies" spent={coaUtil.books_supplies_spent} limit={coaUtil.books_supplies_limit} theme={theme} />
                  )}
                </Surface>
              )}

              {barData.datasets[0].data.some((d) => d > 0) && (
                <Surface style={[styles.chartCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <Text variant="titleSmall" style={styles.chartTitle}>Spending by Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart data={barData} width={Math.max(SCREEN_WIDTH - 48, chartData.length * 80)}
                      height={200} chartConfig={chartConfig} style={{ borderRadius: radius.md }}
                      showValuesOnTopOfBars fromZero yAxisLabel="$" yAxisSuffix="" />
                  </ScrollView>
                </Surface>
              )}

              {pieData.length > 0 && (
                <Surface style={[styles.chartCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <Text variant="titleSmall" style={styles.chartTitle}>Category Breakdown</Text>
                  <PieChart data={pieData} width={SCREEN_WIDTH - 48} height={200}
                    chartConfig={chartConfig} accessor="amount" backgroundColor="transparent" paddingLeft="8" absolute={false} />
                </Surface>
              )}

              <Surface style={[styles.tableCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <Text variant="titleSmall" style={styles.chartTitle}>By Category</Text>
                {summary.by_category.map((cat) => (
                  <View key={cat.category} style={styles.tableRow}>
                    <CategoryBadge category={cat.category as ExpenseCategory} />
                    <View style={styles.tableRight}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{cat.count} item{cat.count !== 1 ? 's' : ''}</Text>
                      <Text variant="titleSmall" style={{ fontWeight: '700' }}>{fmt(cat.total)}</Text>
                    </View>
                  </View>
                ))}
              </Surface>

              <View style={styles.exportRow}>
                <Button mode="contained" icon="file-pdf-box" onPress={handleExportPdf} loading={exporting} disabled={exporting} style={styles.exportBtn}>
                  PDF Report
                </Button>
                <Button mode="outlined" icon="microsoft-excel" onPress={handleExportXlsx} loading={exporting} disabled={exporting} style={styles.exportBtn}>
                  Excel
                </Button>
              </View>
            </>
          )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CoaRow({ label, spent, limit, theme }: { label: string; spent: number; limit: number; theme: MD3Theme }) {
  const pct = Math.min(spent / limit, 1);
  const over = spent > limit;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurface }}>{label}</Text>
        <Text variant="labelSmall" style={{ color: over ? palette.error : theme.colors.onSurfaceVariant }}>
          {fmt(spent)} / {fmt(limit)}
        </Text>
      </View>
      <ProgressBar progress={pct} color={over ? palette.error : palette.primary} style={{ height: 6, borderRadius: 3 }} />
    </View>
  );
}

function SummaryCard({ label, value, icon, color, theme }: {
  label: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string; theme: MD3Theme;
}) {
  return (
    <Surface style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <Ionicons name={icon} size={20} color={color} />
      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{value}</Text>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  segmented: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm },
  summaryCard: { flex: 1, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  chartCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md, overflow: 'hidden' },
  chartTitle: { fontWeight: '700', marginBottom: spacing.sm },
  tableCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  tableRight: { alignItems: 'flex-end' },
  exportRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm },
  exportBtn: { flex: 1 },
});
