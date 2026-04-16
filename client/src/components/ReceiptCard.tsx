import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { Receipt } from '../types';
import { CategoryBadge } from './CategoryBadge';
import { spacing, radius } from '../theme';

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

  // Show the sub-purpose label; fall back to free-text purpose for legacy rows
  const purposeLabel = receipt.purpose_sub
    ? receipt.purpose_sub === 'Other' && receipt.purpose
      ? receipt.purpose
      : receipt.purpose_sub
    : receipt.purpose;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => receipt.image_uri && !pdf && onViewImage(receipt.image_uri)}
          disabled={!receipt.image_uri || pdf}
          style={[styles.thumb, { backgroundColor: theme.colors.surfaceVariant }]}
        >
          {pdf ? (
            <View style={styles.pdfThumb}>
              <Ionicons name="document-text" size={22} color={theme.colors.error} />
              <Text style={[styles.pdfLabel, { color: theme.colors.error }]}>PDF</Text>
            </View>
          ) : receipt.image_uri ? (
            <Image source={{ uri: receipt.image_uri }} style={styles.thumbImage} />
          ) : (
            <Ionicons name="receipt-outline" size={20} color={theme.colors.onSurfaceVariant} />
          )}
        </TouchableOpacity>

        <View style={styles.info}>
          <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '600' }}>
            {receipt.merchant}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {fmtDate(receipt.date)}{receipt.card_last_four ? ` · ····${receipt.card_last_four}` : ''}
          </Text>
          <TouchableOpacity onPress={() => onCategoryPress?.(receipt)} disabled={!onCategoryPress}>
            <CategoryBadge category={receipt.category} />
          </TouchableOpacity>
          {purposeLabel ? (
            <TouchableOpacity onPress={() => onCategoryPress?.(receipt)} disabled={!onCategoryPress}>
              <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {purposeLabel}
              </Text>
            </TouchableOpacity>
          ) : onCategoryPress ? (
            <TouchableOpacity onPress={() => onCategoryPress(receipt)}>
              <Text variant="bodySmall" style={{ color: theme.colors.primary, marginTop: 2, fontSize: 11 }}>
                Tap to set purpose…
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.right}>
          <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.primary }}>
            {fmt(receipt.amount)}
          </Text>
          <View style={styles.actions}>
            <IconButton icon="pencil-outline" size={18} onPress={() => onEdit(receipt)} iconColor={theme.colors.onSurfaceVariant} />
            <IconButton icon="trash-can-outline" size={18} onPress={() => onDelete(receipt.id)} iconColor={theme.colors.error} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, marginHorizontal: spacing.md, marginVertical: spacing.xs, padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 0 },
  thumbImage: { width: '100%', height: '100%' },
  pdfThumb: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  pdfLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  info: { flex: 1, gap: 3 },
  right: { alignItems: 'flex-end', flexShrink: 0 },
  actions: { flexDirection: 'row', marginTop: -8, marginRight: -8 },
});
