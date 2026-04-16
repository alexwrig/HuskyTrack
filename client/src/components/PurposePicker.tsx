import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, useTheme, Menu, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { ExpenseCategory } from '../types';
import { SUB_PURPOSE_MAP } from '../types';
import { spacing, radius } from '../theme';

interface PurposePickerProps {
  category: ExpenseCategory;
  purposeSub: string;
  description: string;
  onChangeSub: (sub: string) => void;
  onChangeDescription: (desc: string) => void;
}

export function PurposePicker({
  category,
  purposeSub,
  description,
  onChangeSub,
  onChangeDescription,
}: PurposePickerProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  const options = SUB_PURPOSE_MAP[category] ?? ['Other'];

  function pick(opt: string) {
    onChangeSub(opt);
    setVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
        Purpose
      </Text>
      <Menu
        visible={visible}
        onDismiss={() => setVisible(false)}
        anchor={
          <TouchableOpacity
            onPress={() => setVisible(true)}
            style={[styles.trigger, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
          >
            <Text
              variant="bodyMedium"
              style={{ color: purposeSub ? theme.colors.onSurface : theme.colors.onSurfaceVariant, flex: 1 }}
            >
              {purposeSub || 'Select purpose...'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        }
        contentStyle={{ maxHeight: 320 }}
      >
        <ScrollView>
          {options.map((opt) => (
            <Menu.Item
              key={opt}
              title={opt}
              trailingIcon={opt === purposeSub ? 'check' : undefined}
              onPress={() => pick(opt)}
            />
          ))}
        </ScrollView>
      </Menu>

      {purposeSub === 'Other' && (
        <TextInput
          label="Description"
          value={description}
          onChangeText={onChangeDescription}
          mode="outlined"
          maxLength={120}
          placeholder="Describe the expense..."
          style={{ marginTop: spacing.xs }}
          multiline
          numberOfLines={2}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  trigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 14,
  },
});
