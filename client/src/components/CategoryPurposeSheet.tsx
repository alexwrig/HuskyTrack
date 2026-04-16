import { useEffect, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Button, useTheme, PaperProvider } from 'react-native-paper';
import { CategoryPicker } from './CategoryPicker';
import { PurposePicker } from './PurposePicker';
import { useAppTheme } from '../context/ThemeContext';
import type { ExpenseCategory, Receipt } from '../types';
import { SUB_PURPOSE_MAP } from '../types';
import { spacing, radius } from '../theme';

interface Props {
  visible: boolean;
  receipt: Receipt | null;
  onDismiss: () => void;
  onSave: (id: string, category: ExpenseCategory, purposeSub: string, purposeDesc: string) => Promise<void>;
}

function SheetContent({ receipt, onDismiss, onSave }: Omit<Props, 'visible'>) {
  const theme = useTheme();
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

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onDismiss} activeOpacity={1} />
      <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <View style={[styles.handle, { backgroundColor: theme.colors.outlineVariant }]} />
        <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
          Edit Category & Purpose
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <CategoryPicker
            value={category}
            onChange={(cat) => {
              const opts = SUB_PURPOSE_MAP[cat];
              if (!opts.includes(purposeSub as typeof opts[number])) {
                setPurposeSub('');
                setPurposeDesc('');
              }
              setCategory(cat);
            }}
          />
          <PurposePicker
            category={category}
            purposeSub={purposeSub}
            description={purposeDesc}
            onChangeSub={setPurposeSub}
            onChangeDescription={setPurposeDesc}
          />
        </ScrollView>
        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} style={{ flex: 1 }}>Cancel</Button>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={{ flex: 1 }}>
            Save
          </Button>
        </View>
      </View>
    </View>
  );
}

export function CategoryPurposeSheet({ visible, receipt, onDismiss, onSave }: Props) {
  const { paperTheme } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      {/* PaperProvider inside the native Modal so Paper's Menu portals render in this window */}
      <PaperProvider theme={paperTheme}>
        <SheetContent receipt={receipt} onDismiss={onDismiss} onSave={onSave} />
      </PaperProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.sm },
  title: { fontWeight: '700', marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
