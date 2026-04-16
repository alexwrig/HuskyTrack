import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, useTheme, List, Surface, Button, Divider, Switch, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiKey, setApiKey, clearApiKey } from '../../src/services/anthropic';
import { spacing, radius } from '../../src/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const [apiKey, setApiKeyState] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getApiKey().then((k) => {
      setSavedKey(k);
      if (k) setApiKeyState(k);
    });
  }, []);

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
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey() {
    Alert.alert('Remove API Key', 'Receipt scanning will be disabled.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearApiKey();
          setSavedKey(null);
          setApiKeyState('');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="headlineSmall" style={styles.title}>Settings</Text>

        {/* AI Receipt Scanning */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
            AI RECEIPT SCANNING
          </Text>
          <View style={styles.keyPad}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.sm }}>
              {savedKey
                ? `Key saved: sk-ant-···${savedKey.slice(-6)}`
                : 'Add your Anthropic API key to enable automatic receipt parsing. Without it you can still add expenses manually.'}
            </Text>

            <TextInput
              label="Anthropic API Key"
              value={apiKey}
              onChangeText={setApiKeyState}
              mode="outlined"
              secureTextEntry={!showKey}
              placeholder="sk-ant-api03-..."
              autoCapitalize="none"
              autoCorrect={false}
              right={
                <TextInput.Icon
                  icon={showKey ? 'eye-off' : 'eye'}
                  onPress={() => setShowKey((v) => !v)}
                />
              }
            />

            <View style={styles.keyActions}>
              <Button
                mode="contained"
                onPress={handleSaveKey}
                loading={saving}
                disabled={saving || !apiKey.trim()}
                style={{ flex: 1 }}
              >
                Save Key
              </Button>
              {savedKey && (
                <Button mode="outlined" onPress={handleClearKey} textColor={theme.colors.error} style={{ borderColor: theme.colors.error }}>
                  Remove
                </Button>
              )}
            </View>

            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: spacing.xs }}>
              Your key is stored securely in the iOS Keychain and never leaves your device.
              Get a key at console.anthropic.com
            </Text>
          </View>
        </Surface>

        {/* 529 Info */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
            529 PLAN RULES
          </Text>
          <List.Item title="Qualified Categories" description="Tuition, Housing, Books, Technology, and more" left={(p) => <List.Icon {...p} icon="school" />} />
          <Divider />
          <List.Item title="K-12 Limit" description="Up to $10,000 per year" left={(p) => <List.Icon {...p} icon="information" />} />
          <Divider />
          <List.Item title="Student Loan Repayment" description="$10,000 lifetime limit" left={(p) => <List.Icon {...p} icon="information" />} />
        </Surface>

        {/* About */}
        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
            ABOUT
          </Text>
          <List.Item title="EduTrack" description="Version 1.0.0 · All data stored on your device" left={(p) => <List.Icon {...p} icon="information-outline" />} />
        </Surface>

        <View style={styles.disclaimer}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            EduTrack is for informational purposes only. Consult a qualified tax professional to
            verify 529 expense eligibility. Keep all original receipts.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  title: { fontWeight: '800', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  section: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, overflow: 'hidden' },
  sectionLabel: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 4, fontSize: 11, letterSpacing: 0.5 },
  keyPad: { padding: spacing.md, paddingTop: 0 },
  keyActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  disclaimer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
