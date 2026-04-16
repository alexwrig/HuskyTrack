import { useEffect, useState, useRef } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Animated, Easing } from 'react-native';
import { Text, useTheme, ProgressBar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useReceiptsStore } from '../../src/store/receiptsStore';
import { ReceiptCard } from '../../src/components/ReceiptCard';
import { SkeletonRow } from '../../src/components/SkeletonRow';
import * as db from '../../src/services/database';
import { deleteReceiptImage } from '../../src/services/imageStorage';
import { getCoa } from '../../src/services/coaStorage';
import type { CoaUtilization } from '../../src/types';
import type { MD3Theme } from 'react-native-paper';
import { spacing, radius, palette } from '../../src/theme';
import { fonts } from '../../src/theme/fonts';

function darken(hex: string, pct = 0.35): string {
  const h = hex.replace('#', '');
  return '#' + [0, 2, 4].map((i) =>
    Math.max(0, Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - pct))).toString(16).padStart(2, '0'),
  ).join('');
}

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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const theme = useTheme();
  const { receipts, isLoading, fetchReceipts, removeReceipt } = useReceiptsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [monthTotal, setMonthTotal] = useState(0);
  const [coaUtil, setCoaUtil] = useState<CoaUtilization | null>(null);

  // Animated counter
  const amountAnim = useRef(new Animated.Value(0)).current;
  const [displayAmt, setDisplayAmt] = useState(0);

  const { start, end } = thisMonthRange();
  const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    fetchReceipts({ sort_by: 'date', sort_order: 'desc' });
    loadCoa();
  }, []);

  useEffect(() => {
    const total = receipts
      .filter((r) => r.date >= start && r.date <= end && r.is_qualified)
      .reduce((s, r) => s + r.amount, 0);
    setMonthTotal(total);
  }, [receipts]);

  useEffect(() => {
    const id = amountAnim.addListener(({ value }) => setDisplayAmt(value));
    Animated.timing(amountAnim, {
      toValue: monthTotal,
      duration: 900,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
    return () => amountAnim.removeListener(id);
  }, [monthTotal]);

  async function loadCoa() {
    const coa = await getCoa();
    const util = await db.getCoaUtilization(coa, new Date().getFullYear() + '-01-01', new Date().getFullYear() + '-12-31');
    setCoaUtil(util);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchReceipts({ sort_by: 'date', sort_order: 'desc' }), loadCoa()]);
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
  const heroColors: [string, string] = [theme.colors.primary, darken(theme.colors.primary)];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Header */}
        <Reanimated.View entering={FadeInDown.duration(400)} style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.colors.onSurfaceVariant }]}>{greeting()}</Text>
            <Text style={[styles.appName, { color: theme.colors.onSurface }]}>EduTrack</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/modals/capture')} style={[styles.cameraBtn, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="camera" size={22} color="#fff" />
          </TouchableOpacity>
        </Reanimated.View>

        {/* Hero gradient card */}
        <Reanimated.View entering={FadeInDown.delay(80).duration(500)} style={styles.heroWrap}>
          <LinearGradient colors={heroColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
            <View style={styles.heroInner}>
              <Text style={styles.heroLabel}>{month} · Qualified 529 Expenses</Text>
              <Text style={styles.heroAmount}>{fmt(displayAmt)}</Text>
              <View style={styles.heroBadge}>
                <Ionicons name="shield-checkmark" size={13} color="rgba(255,255,255,0.9)" />
                <Text style={styles.heroBadgeText}>
                  {thisMonthCount} receipt{thisMonthCount !== 1 ? 's' : ''} this month
                </Text>
              </View>
            </View>
            {/* Decorative circle */}
            <View style={styles.heroCircle} />
            <View style={styles.heroCircle2} />
          </LinearGradient>
        </Reanimated.View>

        {/* Quick stats */}
        <Reanimated.View entering={FadeInDown.delay(160).duration(400)} style={styles.statsRow}>
          <StatCard
            icon="trending-up"
            label="This Month"
            value={String(thisMonthCount)}
            sub="receipts"
            color={theme.colors.primary}
            theme={theme}
          />
          <StatCard
            icon="warning"
            label="Unqualified"
            value={String(unqualified)}
            sub="flagged"
            color={unqualified > 0 ? palette.warning : palette.success}
            theme={theme}
          />
        </Reanimated.View>

        {/* COA utilization */}
        {coaUtil && (coaUtil.tuition_limit > 0 || coaUtil.housing_food_limit > 0 || coaUtil.books_supplies_limit > 0) && (
          <Reanimated.View entering={FadeInDown.delay(200).duration(400)} style={[styles.coaCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
              COST OF ATTENDANCE — {new Date().getFullYear()}
            </Text>
            {coaUtil.tuition_limit > 0 && <CoaBar label="Tuition & Fees" spent={coaUtil.tuition_spent} limit={coaUtil.tuition_limit} theme={theme} />}
            {coaUtil.housing_food_limit > 0 && <CoaBar label="Housing & Food" spent={coaUtil.housing_food_spent} limit={coaUtil.housing_food_limit} theme={theme} />}
            {coaUtil.books_supplies_limit > 0 && <CoaBar label="Books & Supplies" spent={coaUtil.books_supplies_spent} limit={coaUtil.books_supplies_limit} theme={theme} />}
          </Reanimated.View>
        )}

        {/* Recent transactions */}
        <Reanimated.View entering={FadeInDown.delay(240).duration(400)} style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/receipts')} style={styles.seeAll}>
            <Text style={[styles.seeAllText, { color: theme.colors.primary }]}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
          </TouchableOpacity>
        </Reanimated.View>

        {isLoading
          ? [0, 1, 2].map((i) => <SkeletonRow key={i} lines={2} />)
          : recent.length === 0
          ? <EmptyState onCapture={() => router.push('/modals/capture')} theme={theme} primary={theme.colors.primary} />
          : recent.map((r, i) => (
              <Reanimated.View key={r.id} entering={FadeInDown.delay(280 + i * 60).duration(400)}>
                <ReceiptCard
                  receipt={r}
                  onEdit={(rx) => router.push({ pathname: '/modals/edit-receipt', params: { id: rx.id } })}
                  onDelete={handleDelete}
                  onViewImage={(uri) => router.push({ pathname: '/modals/edit-receipt', params: { viewUri: uri } })}
                />
              </Reanimated.View>
            ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, sub, color, theme }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; value: string; sub: string; color: string; theme: MD3Theme;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{value}</Text>
      <Text style={[styles.statSub, { color: theme.colors.onSurfaceVariant }]}>{sub}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

function CoaBar({ label, spent, limit, theme }: { label: string; spent: number; limit: number; theme: MD3Theme }) {
  const pct = Math.min(spent / limit, 1);
  const over = spent > limit;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={[styles.coaLabel, { color: theme.colors.onSurface }]}>{label}</Text>
        <Text style={[styles.coaLabel, { color: over ? palette.error : theme.colors.onSurfaceVariant }]}>
          {fmt(spent)} / {fmt(limit)}
        </Text>
      </View>
      <ProgressBar progress={pct} color={over ? palette.error : theme.colors.primary} style={{ height: 7, borderRadius: 4 }} />
    </View>
  );
}

function EmptyState({ onCapture, theme, primary }: { onCapture: () => void; theme: MD3Theme; primary: string }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: primary + '15' }]}>
        <Ionicons name="receipt-outline" size={40} color={primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No expenses yet</Text>
      <Text style={[styles.emptySub, { color: theme.colors.onSurfaceVariant }]}>
        Scan your first receipt to start tracking 529 expenses.
      </Text>
      <TouchableOpacity onPress={onCapture} style={[styles.emptyBtn, { backgroundColor: primary }]}>
        <Ionicons name="camera" size={16} color="#fff" />
        <Text style={styles.emptyBtnText}>Scan Receipt</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  greeting: { fontFamily: fonts.body, fontSize: 13 },
  appName: { fontFamily: fonts.heading, fontSize: 26, letterSpacing: -0.5 },
  cameraBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  heroWrap: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  heroCard: { borderRadius: radius.xl, padding: spacing.lg, overflow: 'hidden', minHeight: 150 },
  heroInner: { zIndex: 2 },
  heroLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
  heroAmount: { fontFamily: fonts.heading, fontSize: 44, color: '#fff', letterSpacing: -1, marginVertical: 6 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroBadgeText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  heroCircle: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', right: -40, top: -40 },
  heroCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', right: 30, bottom: -50 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  statCard: { flex: 1, borderRadius: radius.lg, padding: spacing.md, gap: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  statIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  statValue: { fontFamily: fonts.heading, fontSize: 24, letterSpacing: -0.5 },
  statSub: { fontFamily: fonts.body, fontSize: 12 },
  statLabel: { fontFamily: fonts.body, fontSize: 11 },
  coaCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.6, marginBottom: spacing.sm },
  coaLabel: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sectionTitle: { fontFamily: fonts.headingSemiBold, fontSize: 17 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  emptyTitle: { fontFamily: fonts.headingSemiBold, fontSize: 18, marginBottom: spacing.xs },
  emptySub: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full },
  emptyBtnText: { fontFamily: fonts.bodySemiBold, color: '#fff', fontSize: 14 },
});
