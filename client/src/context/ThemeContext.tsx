import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import type { MD3Theme } from 'react-native-paper';
import { getThemeColors, saveThemeColors } from '../services/themeStorage';
import type { ThemeColors } from '../services/themeStorage';
import { DEFAULT_COLORS } from '../services/themeStorage';
import { buildLightTheme, buildDarkTheme } from '../theme';

interface ThemeContextValue {
  themeColors: ThemeColors;
  paperTheme: MD3Theme;
  setThemeColors: (colors: ThemeColors) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeColors: DEFAULT_COLORS,
  paperTheme: buildLightTheme(DEFAULT_COLORS.primary, DEFAULT_COLORS.accent),
  setThemeColors: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const [themeColors, setColorsState] = useState<ThemeColors>(DEFAULT_COLORS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getThemeColors().then((c) => {
      setColorsState(c);
      setLoaded(true);
    });
  }, []);

  const paperTheme =
    colorScheme === 'dark'
      ? buildDarkTheme(themeColors.primary, themeColors.accent)
      : buildLightTheme(themeColors.primary, themeColors.accent);

  async function setThemeColors(colors: ThemeColors) {
    await saveThemeColors(colors);
    setColorsState(colors);
  }

  return (
    <ThemeContext.Provider value={{ themeColors, paperTheme, setThemeColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
