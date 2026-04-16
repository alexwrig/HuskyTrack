import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { Receipt } from '../types';
import { CategoryBadge, CATEGORY_COLORS } from './CategoryBadge';
import { spacing, radius } from '../theme';
import { fonts } from '../theme/fonts';

interface ReceiptCardProps {
  receipt: Receipt;
  onEdit: (receipt: Receipt) => void;
  onDelete: (id: string) => void;
  onViewImage: (uri: string) => void;
  onCategoryPress?: (receipt: Receipt) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isPdf(uri: string | null): boolean {
  return uri?.toLowerCase().endsWith('.pdf') ?? false;
}

export function ReceiptCard({ receipt, onEdit, onDelete, onViewImage, onCategoryPress }: ReceiptCardProps) {
  const theme = useTheme();
  const pdf = isPdf(receipt.image_uri);
  const accentColor = CATEGORY_COLORS[receipt.category] ?? theme.colors.primary;

  const purposeLabel = receipt.purpose_sub
    ? receipt.purpose_sub === 'Other' && receipt.purpose
      ? receipt.purpose
      : receipt.purpose_sub
    : receipt.purpose;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      {/* Category accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      <View style={styles.inner}>
        {/* Thumbnail */}
        <TouchableOpacity
          onPress={() => receipt.image_uri && !pdf && onViewImage(receipt.image_uri)}
          disabled={!receipt.image_uri || pdf}
          style={[styles.thumb, { backgroundColor: accentColor + '15' }]}
        >
          {pdf ? (
            <View style={styles.pdfThumb}>
              <Ionicons name="document-text" size={24} color={accentColor} />
              <Text style={[styles.pdfLabel, { color: accentColor }]}>PDF</Text>
            </View>
          ) : receipt.image_uri ? (
            <Image source={{ uri: receipt.image_uri }} style={styles.thumbImage} />
          ) : (
            <Ionicons name="receipt-outline" size={22} color={accentColor} />
          )}
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.merchant, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {receipt.merchant}
          </Text>
          <Text style={[styles.date, { color: theme.colors.onSurfaceVariant }]}>
            {fmtDate(receipt.date)}{receipt.card_last_four ? ` · ····${receipt.card_last_four}` : ''}
          </Text>
          <TouchableOpacity onPress={() => onCategoryPress?.(receipt)} disabled={!onCategoryPress} activeOpacity={0.7}>
            <CategoryBadge category={receipt.category} />
          </TouchableOpacity>
          {purposeLabel ? (
            <TouchableOpacity onPress={() => onCategoryPress?.(receipt)} disabled={!onCategoryPress} activeOpacity={0.7}>
              <Text style={[styles.purpose, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                {purposeLabel}
              </Text>
            </TouchableOpacity>
          ) : onCategoryPress ? (
            <TouchableOpacity onPress={() => onCategoryPress(receipt)} activeOpacity={0.7}>
              <Text style={[styles.purposePrompt, { color: accentColor }]}>
                Tap to set purpose…
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Amount + actions */}
        <View style={styles.right}>
          <Text style={[styles.amount, { color: accentColor }]}>{fmt(receipt.amount)}</Text>
          {receipt.is_qualified ? (
            <View style={[styles.qualBadge, { backgroundColor: '#10b981' + '18' }]}>
              <Ionicons name="shield-checkmark" size={11} color="#10b981" />
              <Text style={[styles.qualText, { color: '#10b981' }]}>529</Text>
            </View>
          ) : (
            <View style={[styles.qualBadge, { backgroundColor: '#f59e0b' + '18' }]}>
              <Ionicons name="warning" size={11} color="#f59e0b" />
              <Text style={[styles.qualText, { color: '#f59e0b' }]}>Review</Text>
            </View>
          )}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => onEdit(receipt)} style={styles.actionBtn} hitSlop={8}>
              <Ionicons name="pencil-outline" size={16} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(receipt.id)} style={styles.actionBtn} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginVertical: 5,
    borderRadius: radius.lg,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  accentBar: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg, flexShrink: 0 },
  inner: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', padding: spacing.sm, gap: spacing.sm, borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: 'hidden' },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbImage: { width: '100%', height: '100%' },
  pdfThumb: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  pdfLabel: { fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.5 },
  info: { flex: 1, gap: 4 },
  merchant: { fontFamily: fonts.headingSemiBold, fontSize: 15, letterSpacing: -0.2 },
  date: { fontFamily: fonts.body, fontSize: 12 },
  purpose: { fontFamily: fonts.body, fontSize: 12, marginTop: 1 },
  purposePrompt: { fontFamily: fonts.bodyMedium, fontSize: 11, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  amount: { fontFamily: fonts.heading, fontSize: 18, letterSpacing: -0.5 },
  qualBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  qualText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 2, marginTop: 2 },
  actionBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
});
