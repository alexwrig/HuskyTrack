import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, useTheme, Menu } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { ExpenseCategory } from '../types';
import { EXPENSE_CATEGORIES, QUALIFIED_CATEGORIES } from '../types';
import { spacing, radius } from '../theme';

interface CategoryPickerProps {
  value: ExpenseCategory;
  onChange: (cat: ExpenseCategory) => void;
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const isQualified = (QUALIFIED_CATEGORIES as string[]).includes(value);

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
        contentStyle={{ maxHeight: 400 }}
      >
        <ScrollView>
          {EXPENSE_CATEGORIES.map((cat) => {
            const qualified = (QUALIFIED_CATEGORIES as string[]).includes(cat);
            return (
              <Menu.Item key={cat} title={cat} trailingIcon={cat === value ? 'check' : undefined}
                leadingIcon={qualified ? 'check-circle-outline' : 'alert-outline'}
                onPress={() => { onChange(cat); setVisible(false); }} />
            );
          })}
        </ScrollView>
      </Menu>
      {!isQualified && (
        <Text variant="labelSmall" style={{ color: '#f59e0b', marginTop: 4 }}>
          This category may not qualify as a 529 expense
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  trigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 14 },
  triggerLeft: { flexDirection: 'row', alignItems: 'center' },
});
