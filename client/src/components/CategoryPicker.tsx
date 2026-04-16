import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, useTheme, Menu, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { ExpenseCategory } from '../types';
import { EXPENSE_CATEGORIES, QUALIFIED_CATEGORIES, HOUSING_FOOD_CATEGORIES } from '../types';
import { spacing, radius } from '../theme';

interface CategoryPickerProps {
  value: ExpenseCategory;
  onChange: (cat: ExpenseCategory) => void;
}

// Categories shown in the primary prominent group
const PRIMARY_CATS: ExpenseCategory[] = ['Tuition & Fees', 'Housing & Food', 'Food & Groceries', 'Books & Course Supplies'];
const REST_CATS = EXPENSE_CATEGORIES.filter((c) => !PRIMARY_CATS.includes(c));

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const isQualified = (QUALIFIED_CATEGORIES as string[]).includes(value);
  const isHousingFood = (HOUSING_FOOD_CATEGORIES as string[]).includes(value);

  function pick(cat: ExpenseCategory) {
    onChange(cat);
    setVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Category</Text>
      <Menu
        visible={visible}
        onDismiss={() => setVisible(false)}
        anchor={
          <TouchableOpacity onPress={() => setVisible(true)} style={[styles.trigger, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
            <View style={styles.triggerLeft}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{value}</Text>
              {!isQualified && <Ionicons name="warning" size={14} color="#f59e0b" style={{ marginLeft: spacing.xs }} />}
            </View>
            <Ionicons name="chevron-down" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        }
        contentStyle={{ maxHeight: 440 }}
      >
        <ScrollView>
          <Text variant="labelSmall" style={[styles.menuGroup, { color: theme.colors.onSurfaceVariant }]}>
            COMMON 529 CATEGORIES
          </Text>
          {PRIMARY_CATS.map((cat) => {
            const isHF = (HOUSING_FOOD_CATEGORIES as string[]).includes(cat);
            return (
              <Menu.Item
                key={cat}
                title={cat}
                titleStyle={isHF ? { paddingLeft: cat === 'Food & Groceries' ? spacing.sm : 0 } : undefined}
                trailingIcon={cat === value ? 'check' : undefined}
                leadingIcon="check-circle-outline"
                onPress={() => pick(cat)}
              />
            );
          })}
          <Divider />
          <Text variant="labelSmall" style={[styles.menuGroup, { color: theme.colors.onSurfaceVariant }]}>
            OTHER CATEGORIES
          </Text>
          {REST_CATS.map((cat) => {
            const qualified = (QUALIFIED_CATEGORIES as string[]).includes(cat);
            return (
              <Menu.Item
                key={cat}
                title={cat}
                trailingIcon={cat === value ? 'check' : undefined}
                leadingIcon={qualified ? 'check-circle-outline' : 'alert-outline'}
                onPress={() => pick(cat)}
              />
            );
          })}
        </ScrollView>
      </Menu>
      {!isQualified && (
        <Text variant="labelSmall" style={{ color: '#f59e0b', marginTop: 4 }}>
          This category may not qualify as a 529 expense
        </Text>
      )}
      {isHousingFood && (
        <Text variant="labelSmall" style={{ color: '#6b7280', marginTop: 4 }}>
          Counts toward your Housing & Food COA limit
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  trigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 14 },
  triggerLeft: { flexDirection: 'row', alignItems: 'center' },
  menuGroup: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 2, fontSize: 10, letterSpacing: 0.8 },
});
