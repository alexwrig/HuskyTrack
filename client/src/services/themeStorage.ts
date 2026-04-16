import * as SecureStore from 'expo-secure-store';

export interface ThemeColors {
  primary: string;
  accent: string;
}

export type ColorMode = 'light' | 'dark' | 'system';

export const DEFAULT_COLORS: ThemeColors = {
  primary: '#1a56db',
  accent: '#6366f1',
};

const COLORS_KEY = 'theme_colors';
const MODE_KEY = 'color_mode';

export async function getThemeColors(): Promise<ThemeColors> {
  try {
    const raw = await SecureStore.getItemAsync(COLORS_KEY);
    if (!raw) return { ...DEFAULT_COLORS };
    return { ...DEFAULT_COLORS, ...JSON.parse(raw) } as ThemeColors;
  } catch {
    return { ...DEFAULT_COLORS };
  }
}

export async function saveThemeColors(colors: ThemeColors): Promise<void> {
  await SecureStore.setItemAsync(COLORS_KEY, JSON.stringify(colors));
}

export async function getColorMode(): Promise<ColorMode> {
  try {
    const raw = await SecureStore.getItemAsync(MODE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    return 'system';
  } catch {
    return 'system';
  }
}

export async function saveColorMode(mode: ColorMode): Promise<void> {
  await SecureStore.setItemAsync(MODE_KEY, mode);
}
