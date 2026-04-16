import { useEffect, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput as RNTextInput } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import type { ExpenseCategory, Receipt } from '../types';
import { EXPENSE_CATEGORIES, QUALIFIED_CATEGORIES, SUB_PURPOSE_MAP } from '../types';
import { CATEGORY_COLORS } from './CategoryBadge';
import { spacing, radius } from '../theme';
import { fonts } from '../theme/fonts';

interface Props {
  visible: boolean;
  receipt: Receipt | null;
  onDismiss: () => void;
  onSave: (id: string, category: ExpenseCategory, purposeSub: string, purposeDesc: string) => Promise<void>;
}

export function CategoryPurposeSheet({ visible, receipt, onDismiss, onSave }: Props) {
  const { paperTheme } = useAppTheme();
  const colors = paperTheme.colors;

  const [category, setCategory] = useState<ExpenseCategory>('Other');
  const [purposeSub, setPurposeSub] = useState('');
  const [purposeDesc, setPurposeDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (receipt) {
      setCategory(receipt.category);
      setPurposeSub(receipt.purpose_sub ?? '');
      setPurposeDesc(receipt.purpose ?? '');
    }
  }, [receipt?.id]);

  function pickCategory(cat: ExpenseCategory) {
    setCategory(cat);
    // Reset purpose if not valid for new category
    const opts = SUB_PURPOSE_MAP[cat];
    if (!opts.includes(purposeSub as typeof opts[number])) {
      setPurposeSub('');
      setPurposeDesc('');
    }
  }

  async function handleSave() {
    if (!receipt) return;
    setSaving(true);
    try {
      await onSave(receipt.id, category, purposeSub, purposeDesc);
      onDismiss();
    } finally {
      setSaving(false);
    }
  }

  const purposeOptions = SUB_PURPOSE_MAP[category] ?? ['Other'];
  const isQualified = (QUALIFIED_CATEGORIES as string[]).includes(category);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onDismiss} activeOpacity={1} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.handle, { backgroundColor: colors.outlineVariant }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]}>Edit Category</Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing.md }}
          >
            {/* Category grid */}
            <Text style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}>CATEGORY</Text>
            <View style={styles.categoryGrid}>
              {EXPENSE_CATEGORIES.map((cat) => {
                const selected = cat === category;
                const accentColor = CATEGORY_COLORS[cat] ?? colors.primary;
                const qualified = (QUALIFIED_CATEGORIES as string[]).includes(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => pickCategory(cat)}
                    activeOpacity={0.7}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: selected ? accentColor : colors.surfaceVariant,
                        borderWidth: selected ? 0 : 1,
                        borderColor: colors.outline,
                      },
                    ]}
                  >
                    {!qualified && !selected && (
                      <Ionicons name="warning" size={11} color="#f59e0b" style={{ marginRight: 3 }} />
                    )}
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: selected ? '#fff' : colors.onSurface },
                      ]}
                      numberOfLines={1}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!isQualified && (
              <View style={styles.warningRow}>
                <Ionicons name="warning" size={14} color="#f59e0b" />
                <Text style={styles.warningText}>This category may not qualify as a 529 expense</Text>
              </View>
            )}

            {/* Purpose options */}
            <Text style={[styles.sectionLabel, { color: colors.onSurfaceVariant, marginTop: spacing.md }]}>PURPOSE</Text>
            <View style={styles.purposeList}>
              {purposeOptions.map((opt) => {
                const selected = opt === purposeSub;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setPurposeSub(opt)}
                    activeOpacity={0.7}
                    style={[
                      styles.purposeRow,
                      {
                        backgroundColor: selected ? colors.primary + '14' : 'transparent',
                        borderColor: selected ? colors.primary : colors.outline,
                      },
                    ]}
                  >
                    <View style={[styles.radioOuter, { borderColor: selected ? colors.primary : colors.onSurfaceVariant }]}>
                      {selected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                    </View>
                    <Text style={[styles.purposeText, { color: selected ? colors.primary : colors.onSurface }]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {purposeSub === 'Other' && (
              <RNTextInput
                value={purposeDesc}
                onChangeText={setPurposeDesc}
                placeholder="Describe the expense..."
                placeholderTextColor={colors.onSurfaceVariant}
                multiline
                numberOfLines={2}
                maxLength={120}
                style={[styles.descInput, { color: colors.onSurface, borderColor: colors.outline, backgroundColor: colors.surfaceVariant }]}
              />
            )}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.outline }]}>
            <Button mode="outlined" onPress={onDismiss} style={{ flex: 1 }}>Cancel</Button>
            <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={{ flex: 1 }}>
              Save
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '82%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontFamily: fonts.headingSemiBold, fontSize: 18 },
  sectionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.7, marginBottom: spacing.xs },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  categoryChipText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  warningText: { fontFamily: fonts.body, fontSize: 12, color: '#f59e0b' },
  purposeList: { gap: spacing.xs },
  purposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioInner: { width: 9, height: 9, borderRadius: 4.5 },
  purposeText: { fontFamily: fonts.bodyMedium, fontSize: 14, flex: 1 },
  descInput: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    fontFamily: fonts.body,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
  },
});
