import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { lightTheme, darkTheme } from '../src/theme';
import { initDatabase } from '../src/services/database';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch(console.error);
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={theme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="modals/capture"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="modals/edit-receipt"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="modals/import"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
