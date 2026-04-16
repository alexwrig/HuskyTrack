import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_700Bold,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_500Medium,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { ThemeProvider, useAppTheme } from '../src/context/ThemeContext';
import { initDatabase } from '../src/services/database';
import { lightTheme } from '../src/theme';

function AppShell() {
  const { paperTheme, isDark } = useAppTheme();
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_500Medium,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    initDatabase().then(() => setDbReady(true)).catch(console.error);
  }, []);

  if (!dbReady || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: lightTheme.colors.background }}>
        <ActivityIndicator color={lightTheme.colors.primary} />
      </View>
    );
  }

  return (
    <PaperProvider theme={paperTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modals/capture" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="modals/scanner" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="modals/edit-receipt" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="modals/import" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="modals/batch-upload" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
