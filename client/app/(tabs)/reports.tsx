import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Alert, TouchableOpacity } from 'react-native';
import { Text, useTheme, Button, Surface, SegmentedButtons, ProgressBar, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import type { MD3Theme } from 'react-native-paper';
import * as db from '../../src/services/database';
import { exportPdf } from '../../src/services/pdfExport';
import { exportXlsx } from '../../src/services/xlsxExport';
import { listReceipts } from '../../src/services/database';
import { getCoa } from '../../src/services/coaStorage';
import { SkeletonRow } from '../../src/components/SkeletonRow';
import { CategoryBadge, CATEGORY_COLORS } from '../../src/components/CategoryBadge';
import type { ReportSummary, ExpenseCategory, CoaUtilization, MerchantSummary } from '../../src/types';
import { EXPENSE_CATEGORIES } from '../../src/types';
import { spacing, radius, palette, CHART_COLORS } from '../../src/theme';
import { useAppTheme } from '../../src/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

function fmtK(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

export default function ReportsScreen() {
  const theme = useTheme();
  const { themeColors } = useAppTheme();
  const [period, setPeriod] = useState<Period>('year');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [coaUtil, setCoaUtil] = useState<CoaUtilization | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<ExpenseCategory[]>([]);
  const [lineToggle, setLineToggle] = useState<'month' | 'qualified'>('month');

  const { start, end } = getPeriodDates(period);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m, coa] = await Promise.all([
        db.getReportSummary(start, end),
        db.getTopMerchants(8, start, end),
        getCoa(),
      ]);
      setSummary(s);
      setMerchants(m);
      setCoaUtil(await db.getCoaUtilization(coa, start, end));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

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

  function toggleCategory(cat: ExpenseCategory) {
    setActiveCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  // Filter summary by active categories
  const filteredCats = summary
    ? (activeCategories.length > 0
      ? summary.by_category.filter((c) => activeCategories.includes(c.category as ExpenseCategory))
      : summary.by_category)
    : [];

  const chartConfig = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 0,
    color: () => themeColors.primary,
    labelColor: () => theme.colors.onSurfaceVariant,
    propsForLabels: { fontSize: 12 },
    propsForVerticalLabels: { fontSize: 11 },
    style: { borderRadius: radius.md },
  };

  // Line chart: spending by month
  const monthData = summary?.by_month ?? [];
  const lineLabels = monthData.map((m) => MONTH_ABBR[m.month - 1]);
  const lineValues = lineToggle === 'month'
    ? monthData.map((m) => m.total)
    : monthData.map((m) => m.by_category.filter((c) => c.is_qualified).reduce((s, c) => s + c.total, 0));

  // Bar chart: top categories
  const barCats = filteredCats.slice(0, 6);
  const barData = {
    labels: barCats.map((c) => c.category.split(' ')[0]),
    datasets: [{ data: barCats.length > 0 ? barCats.map((c) => c.total) : [0] }],
  };

  // Pie chart
  const pieData = filteredCats.slice(0, 6).map((c, i) => ({
    name: c.category,
    amount: c.total,
    color: CHART_COLORS[i % CHART_COLORS.length],
    legendFontColor: theme.colors.onSurface,
    legendFontSize: 12,
  }));

  const activeFilterCount = activeCategories.length;

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
            { value: 'all', label: 'All' },
          ]}
        />

        {/* Filter bar */}
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
            onPress={() => setFilterOpen((v) => !v)}
          >
            <Ionicons name="filter" size={16} color={theme.colors.primary} />
            <Text variant="labelMedium" style={{ color: theme.colors.primary, marginLeft: 4 }}>
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>
          {activeFilterCount > 0 && (
            <TouchableOpacity onPress={() => setActiveCategories([])}>
              <Text variant="labelSmall" style={{ color: theme.colors.error }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {filterOpen && (
          <Surface style={[styles.filterPanel, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.xs }}>
              CATEGORIES
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  selected={activeCategories.includes(cat)}
                  onPress={() => toggleCategory(cat)}
                  compact
                  style={{ marginBottom: 0 }}
                >
                  {cat.split(' ')[0]}
                </Chip>
              ))}
            </ScrollView>
          </Surface>
        )}

        {loading
          ? [0, 1, 2, 3].map((i) => <SkeletonRow key={i} lines={2} />)
          : summary && (
            <>
              {/* Summary totals */}
              <View style={styles.summaryRow}>
                <SummaryCard label="Total Qualified" value={fmt(summary.total_qualified)} icon="checkmark-circle" color={palette.success} theme={theme} />
                <SummaryCard label="Non-Qualified" value={fmt(summary.total_non_qualified)} icon="warning" color={palette.warning} theme={theme} />
              </View>

              {/* COA Utilization */}
              {coaUtil && (coaUtil.tuition_limit > 0 || coaUtil.housing_food_limit > 0 || coaUtil.books_supplies_limit > 0) && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <Text variant="titleSmall" style={styles.cardTitle}>COA Budget Utilization</Text>
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

              {/* Spending over time (line chart) */}
              {monthData.length >= 2 && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <View style={styles.cardHeader}>
                    <Text variant="titleSmall" style={styles.cardTitle}>Spending Over Time</Text>
                    <SegmentedButtons
                      value={lineToggle}
                      onValueChange={(v) => setLineToggle(v as 'month' | 'qualified')}
                      density="small"
                      buttons={[
                        { value: 'month', label: 'Total' },
                        { value: 'qualified', label: 'Qualified' },
                      ]}
                      style={{ width: 160 }}
                    />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <LineChart
                      data={{ labels: lineLabels, datasets: [{ data: lineValues.length > 0 ? lineValues : [0], color: () => themeColors.primary }] }}
                      width={Math.max(SCREEN_WIDTH - 48, monthData.length * 60)}
                      height={200}
                      chartConfig={chartConfig}
                      bezier
                      formatYLabel={(v) => fmtK(parseFloat(v))}
                      style={{ borderRadius: radius.md }}
                      fromZero
                    />
                  </ScrollView>
                </Surface>
              )}

              {/* Bar chart: by category */}
              {barData.datasets[0].data.some((d) => d > 0) && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <Text variant="titleSmall" style={styles.cardTitle}>Spending by Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart
                      data={barData}
                      width={Math.max(SCREEN_WIDTH - 48, barCats.length * 80)}
                      height={220}
                      chartConfig={chartConfig}
                      style={{ borderRadius: radius.md }}
                      showValuesOnTopOfBars
                      fromZero
                      yAxisLabel="$"
                      yAxisSuffix=""
                    />
                  </ScrollView>
                </Surface>
              )}

              {/* Top merchants horizontal bars */}
              {merchants.length > 0 && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <Text variant="titleSmall" style={styles.cardTitle}>Top Merchants</Text>
                  {merchants.map((m, i) => {
                    const pct = merchants[0].total > 0 ? m.total / merchants[0].total : 0;
                    return (
                      <View key={m.merchant} style={styles.merchantRow}>
                        <View style={styles.merchantLabel}>
                          <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurface, flex: 1 }}>
                            {m.merchant}
                          </Text>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: spacing.xs }}>
                            {fmt(m.total)}
                          </Text>
                        </View>
                        <View style={[styles.merchantBarBg, { backgroundColor: theme.colors.surfaceVariant }]}>
                          <View style={[styles.merchantBarFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                        </View>
                      </View>
                    );
                  })}
                </Surface>
              )}

              {/* Pie chart with legend below */}
              {pieData.length > 0 && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <Text variant="titleSmall" style={styles.cardTitle}>Category Breakdown</Text>
                  <PieChart
                    data={pieData}
                    width={SCREEN_WIDTH - 48}
                    height={180}
                    chartConfig={chartConfig}
                    accessor="amount"
                    backgroundColor="transparent"
                    paddingLeft="8"
                    hasLegend={false}
                    absolute={false}
                  />
                  <View style={styles.pieLegend}>
                    {pieData.map((d) => (
                      <View key={d.name} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                        <Text variant="labelSmall" numberOfLines={1} style={{ flex: 1, color: theme.colors.onSurface }}>{d.name}</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{fmt(d.amount)}</Text>
                      </View>
                    ))}
                  </View>
                </Surface>
              )}

              {/* Category table */}
              <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <Text variant="titleSmall" style={styles.cardTitle}>By Category</Text>
                {filteredCats.map((cat) => (
                  <View key={cat.category} style={styles.tableRow}>
                    <CategoryBadge category={cat.category as ExpenseCategory} />
                    <View style={styles.tableRight}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {cat.count} item{cat.count !== 1 ? 's' : ''}
                      </Text>
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
      <Ionicons name={icon} size={22} color={color} />
      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{value}</Text>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  segmented: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  filterBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1 },
  filterPanel: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm },
  summaryCard: { flex: 1, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontWeight: '700', marginBottom: spacing.sm, fontSize: 14 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  tableRight: { alignItems: 'flex-end' },
  merchantRow: { marginBottom: spacing.sm },
  merchantLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  merchantBarBg: { height: 10, borderRadius: 5, overflow: 'hidden' },
  merchantBarFill: { height: '100%', borderRadius: 5 },
  pieLegend: { marginTop: spacing.sm, gap: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  exportRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm },
  exportBtn: { flex: 1 },
});
