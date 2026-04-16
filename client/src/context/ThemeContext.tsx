import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import type { MD3Theme } from 'react-native-paper';
import { getThemeColors, saveThemeColors, getColorMode, saveColorMode } from '../services/themeStorage';
import type { ThemeColors, ColorMode } from '../services/themeStorage';
import { DEFAULT_COLORS } from '../services/themeStorage';
import { buildLightTheme, buildDarkTheme } from '../theme';

interface ThemeContextValue {
  themeColors: ThemeColors;
  paperTheme: MD3Theme;
  colorMode: ColorMode;
  isDark: boolean;
  setThemeColors: (colors: ThemeColors) => Promise<void>;
  setColorMode: (mode: ColorMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeColors: DEFAULT_COLORS,
  paperTheme: buildLightTheme(DEFAULT_COLORS.primary, DEFAULT_COLORS.accent),
  colorMode: 'system',
  isDark: false,
  setThemeColors: async () => {},
  setColorMode: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeColors, setColorsState] = useState<ThemeColors>(DEFAULT_COLORS);
  const [colorMode, setModeState] = useState<ColorMode>('system');

  useEffect(() => {
    Promise.all([getThemeColors(), getColorMode()]).then(([colors, mode]) => {
      setColorsState(colors);
      setModeState(mode);
    });
  }, []);

  const isDark =
    colorMode === 'dark' ||
    (colorMode === 'system' && systemScheme === 'dark');

  const paperTheme = isDark
    ? buildDarkTheme(themeColors.primary, themeColors.accent)
    : buildLightTheme(themeColors.primary, themeColors.accent);

  async function setThemeColors(colors: ThemeColors) {
    await saveThemeColors(colors);
    setColorsState(colors);
  }

  async function setColorMode(mode: ColorMode) {
    await saveColorMode(mode);
    setModeState(mode);
  }

  return (
    <ThemeContext.Provider value={{ themeColors, paperTheme, colorMode, isDark, setThemeColors, setColorMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
