import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { ExpenseCategory } from '../types';
import { QUALIFIED_CATEGORIES } from '../types';
import { radius, spacing } from '../theme';

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  'Tuition & Fees': '#1a56db',
  'Housing & Food': '#0891b2',
  'Food & Groceries': '#0369a1',
  'Books & Course Supplies': '#7c3aed',
  'Technology': '#0d9488',
  'Special Needs Services': '#d97706',
  'Apprenticeship Programs': '#059669',
  'Student Loan Repayment': '#dc2626',
  'K-12 Tuition': '#4f46e5',
  'Other': '#6b7280',
};

interface CategoryBadgeProps {
  category: ExpenseCategory;
  showWarning?: boolean;
}

export function CategoryBadge({ category, showWarning = true }: CategoryBadgeProps) {
  const color = CATEGORY_COLORS[category] ?? '#6b7280';
  const isQualified = (QUALIFIED_CATEGORIES as string[]).includes(category);

  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
      <Text style={[styles.label, { color }]} numberOfLines={1}>{category}</Text>
      {showWarning && !isQualified && (
        <Ionicons name="warning" size={12} color="#f59e0b" style={{ marginLeft: 4 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  label: { fontSize: 11, fontWeight: '600' },
});

export { CATEGORY_COLORS };
