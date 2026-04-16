import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Modal, TouchableOpacity, SafeAreaView as RNSafeAreaView } from 'react-native';
import { Text, useTheme, List, Surface, Button, Divider, TextInput, SegmentedButtons, PaperProvider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getApiKey, setApiKey, clearApiKey } from '../../src/services/anthropic';
import { getCoa, saveCoa } from '../../src/services/coaStorage';
import { useAppTheme } from '../../src/context/ThemeContext';
import { HexColorPicker } from '../../src/components/HexColorPicker';
import type { CostOfAttendance } from '../../src/types';
import { DEFAULT_COA } from '../../src/types';
import { spacing, radius } from '../../src/theme';

const DEFAULT_PRIMARY = '#1a56db';
const DEFAULT_ACCENT = '#6366f1';

function ColorPickerModal({
  visible, primary, accent, onChangePrimary, onChangeAccent, onApply, onClose, paperTheme,
}: {
  visible: boolean;
  primary: string;
  accent: string;
  onChangePrimary: (c: string) => void;
  onChangeAccent: (c: string) => void;
  onApply: () => void;
  onClose: () => void;
  paperTheme: any;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <PaperProvider theme={paperTheme}>
        <ColorPickerContent
          primary={primary}
          accent={accent}
          onChangePrimary={onChangePrimary}
          onChangeAccent={onChangeAccent}
          onApply={onApply}
          onClose={onClose}
        />
      </PaperProvider>
    </Modal>
  );
}

function ColorPickerContent({ primary, accent, onChangePrimary, onChangeAccent, onApply, onClose }: {
  primary: string; accent: string;
  onChangePrimary: (c: string) => void; onChangeAccent: (c: string) => void;
  onApply: () => void; onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <RNSafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={cpStyles.header}>
        <TouchableOpacity onPress={onClose} style={cpStyles.closeBtn}>
          <Ionicons name="close" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
          Customize Colors
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={cpStyles.scroll}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.md }}>
          Add your school's colors! Drag the sliders or type a hex code.
        </Text>

        {/* Live preview */}
        <View style={cpStyles.preview}>
          <View style={[cpStyles.previewBtn, { backgroundColor: primary }]}>
            <Text style={cpStyles.previewLabel}>Primary</Text>
          </View>
          <View style={[cpStyles.previewBtn, { backgroundColor: accent }]}>
            <Text style={cpStyles.previewLabel}>Accent</Text>
          </View>
        </View>

        <HexColorPicker id="primary" label="Primary Color" value={primary} onChange={onChangePrimary} />
        <HexColorPicker id="accent" label="Accent Color" value={accent} onChange={onChangeAccent} />
      </ScrollView>

      <View style={cpStyles.footer}>
        <Button
          mode="outlined"
          onPress={() => { onChangePrimary(DEFAULT_PRIMARY); onChangeAccent(DEFAULT_ACCENT); }}
          style={{ flex: 1 }}
        >
          Reset
        </Button>
        <Button mode="contained" onPress={onApply} style={{ flex: 1 }}>
          Apply Colors
        </Button>
      </View>
    </RNSafeAreaView>
  );
}

const cpStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.1)' },
  closeBtn: { padding: spacing.xs },
  scroll: { padding: spacing.md },
  preview: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  previewBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  previewLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.lg },
});

export default function SettingsScreen() {
  const theme = useTheme();
  const { themeColors, setThemeColors, colorMode, setColorMode, paperTheme } = useAppTheme();

  const [apiKey, setApiKeyState] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [coa, setCoa] = useState<CostOfAttendance>(DEFAULT_COA);
  const [coaSaving, setCoaSaving] = useState(false);

  const [primary, setPrimary] = useState(themeColors.primary);
  const [accent, setAccent] = useState(themeColors.accent);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);

  useEffect(() => {
    getApiKey().then((k) => { setSavedKey(k); if (k) setApiKeyState(k); });
    getCoa().then(setCoa);
  }, []);

  useEffect(() => {
    setPrimary(themeColors.primary);
    setAccent(themeColors.accent);
  }, [themeColors]);

  async function handleSaveKey() {
    if (!apiKey.trim().startsWith('sk-ant-')) {
      Alert.alert('Invalid key', 'Anthropic API keys start with sk-ant-');
      return;
    }
    setSaving(true);
    try {
      await setApiKey(apiKey.trim());
      setSavedKey(apiKey.trim());
      Alert.alert('Saved', 'API key saved securely on your device.');
    } finally { setSaving(false); }
  }

  async function handleSaveCoa() {
    setCoaSaving(true);
    try {
      await saveCoa(coa);
      Alert.alert('Saved', 'Cost of Attendance limits updated.');
    } finally { setCoaSaving(false); }
  }

  function setCoaField(field: keyof CostOfAttendance, raw: string) {
    setCoa((prev) => ({ ...prev, [field]: parseFloat(raw) || 0 }));
  }

  async function handleClearKey() {
    Alert.alert('Remove API Key', 'Receipt scanning will be disabled.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await clearApiKey(); setSavedKey(null); setApiKeyState(''); } },
    ]);
  }

  async function handleApplyColors() {
    await setThemeColors({ primary, accent });
    setColorPickerVisible(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="headlineSmall" style={styles.title}>Settings</Text>

        {/* AI Receipt Scanning */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>AI RECEIPT SCANNING</Text>
          <View style={styles.pad}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.sm }}>
              {savedKey ? `Key saved: sk-ant-···${savedKey.slice(-6)}` : 'Add your Anthropic API key to enable automatic receipt parsing.'}
            </Text>
            <TextInput label="Anthropic API Key" value={apiKey} onChangeText={setApiKeyState} mode="outlined"
              secureTextEntry={!showKey} placeholder="sk-ant-api03-..." autoCapitalize="none" autoCorrect={false}
              right={<TextInput.Icon icon={showKey ? 'eye-off' : 'eye'} onPress={() => setShowKey((v) => !v)} />} />
            <View style={styles.keyActions}>
              <Button mode="contained" onPress={handleSaveKey} loading={saving} disabled={saving || !apiKey.trim()} style={{ flex: 1 }}>Save Key</Button>
              {savedKey && (
                <Button mode="outlined" onPress={handleClearKey} textColor={theme.colors.error} style={{ borderColor: theme.colors.error }}>Remove</Button>
              )}
            </View>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: spacing.xs }}>
              Your key is stored securely in the iOS Keychain and never leaves your device.
            </Text>
          </View>
        </Surface>

        {/* Cost of Attendance */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>COST OF ATTENDANCE LIMITS</Text>
          <View style={styles.pad}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.sm }}>
              Enter your school's annual COA figures to track spending against each limit.
            </Text>
            <TextInput label="Tuition & Fees" value={coa.tuition > 0 ? String(coa.tuition) : ''} onChangeText={(v) => setCoaField('tuition', v)} mode="outlined" keyboardType="decimal-pad" style={styles.coaInput} left={<TextInput.Affix text="$" />} />
            <TextInput label="Housing & Food (combined)" value={coa.housing_food > 0 ? String(coa.housing_food) : ''} onChangeText={(v) => setCoaField('housing_food', v)} mode="outlined" keyboardType="decimal-pad" style={styles.coaInput} left={<TextInput.Affix text="$" />} />
            <TextInput label="Books & Course Supplies" value={coa.books_supplies > 0 ? String(coa.books_supplies) : ''} onChangeText={(v) => setCoaField('books_supplies', v)} mode="outlined" keyboardType="decimal-pad" style={styles.coaInput} left={<TextInput.Affix text="$" />} />
            <Button mode="contained" onPress={handleSaveCoa} loading={coaSaving} disabled={coaSaving} style={{ marginTop: spacing.xs }}>Save Limits</Button>
          </View>
        </Surface>

        {/* Appearance */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>APPEARANCE</Text>
          <View style={styles.pad}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.sm }}>
              Choose how EduTrack looks on your device.
            </Text>
            <SegmentedButtons
              value={colorMode}
              onValueChange={(v) => setColorMode(v as any)}
              buttons={[
                { value: 'light', label: 'Light', icon: 'weather-sunny' },
                { value: 'system', label: 'Auto', icon: 'theme-light-dark' },
                { value: 'dark', label: 'Dark', icon: 'weather-night' },
              ]}
            />
          </View>
        </Surface>

        {/* Personalize */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PERSONALIZE YOUR APP</Text>
          <View style={styles.pad}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.md }}>
              Add your school's colors to make EduTrack your own.
            </Text>
            <View style={styles.preview}>
              <View style={[styles.previewBtn, { backgroundColor: themeColors.primary }]}>
                <Text style={styles.previewBtnLabel}>Primary</Text>
              </View>
              <View style={[styles.previewBtn, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.previewBtnLabel}>Accent</Text>
              </View>
            </View>
            <Button mode="outlined" icon="palette" onPress={() => setColorPickerVisible(true)}>
              Customize Colors
            </Button>
          </View>
        </Surface>

        {/* 529 Info */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>529 PLAN RULES</Text>
          <List.Item title="Qualified Categories" description="Tuition, Housing, Books, Technology, and more" left={(p) => <List.Icon {...p} icon="school" />} />
          <Divider />
          <List.Item title="K-12 Limit" description="Up to $10,000 per year" left={(p) => <List.Icon {...p} icon="information" />} />
          <Divider />
          <List.Item title="Student Loan Repayment" description="$10,000 lifetime limit" left={(p) => <List.Icon {...p} icon="information" />} />
        </Surface>

        {/* About */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>ABOUT</Text>
          <List.Item title="EduTrack" description="Version 1.0.0 · All data stored on your device" left={(p) => <List.Icon {...p} icon="information-outline" />} />
        </Surface>

        <View style={styles.disclaimer}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            EduTrack is for informational purposes only. Consult a qualified tax professional to verify 529 expense eligibility.
          </Text>
        </View>
      </ScrollView>

      <ColorPickerModal
        visible={colorPickerVisible}
        primary={primary}
        accent={accent}
        onChangePrimary={setPrimary}
        onChangeAccent={setAccent}
        onApply={handleApplyColors}
        onClose={() => setColorPickerVisible(false)}
        paperTheme={paperTheme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  title: { fontWeight: '800', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  section: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, overflow: 'hidden' },
  sectionLabel: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 4, fontSize: 11, letterSpacing: 0.5 },
  pad: { padding: spacing.md, paddingTop: 0 },
  keyActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  coaInput: { marginBottom: spacing.sm },
  preview: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  previewBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  previewBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  disclaimer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
