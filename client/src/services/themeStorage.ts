import * as SecureStore from 'expo-secure-store';

export interface ThemeColors {
  primary: string;
  accent: string;
}

export const DEFAULT_COLORS: ThemeColors = {
  primary: '#1a56db',
  accent: '#6366f1',
};

export const UNIVERSITY_PRESETS: Array<{ name: string } & ThemeColors> = [
  { name: 'Default',     primary: '#1a56db', accent: '#6366f1' },
  { name: 'UW Huskies',  primary: '#4b2e83', accent: '#b7a57a' },
  { name: 'Michigan',    primary: '#00274C', accent: '#FFCB05' },
  { name: 'UCLA',        primary: '#2774AE', accent: '#FFD100' },
  { name: 'Stanford',    primary: '#8C1515', accent: '#B03A2E' },
  { name: 'Notre Dame',  primary: '#0C2340', accent: '#C99700' },
  { name: 'Duke',        primary: '#00356B', accent: '#C84E00' },
  { name: 'Ohio State',  primary: '#BB0000', accent: '#666666' },
];

const KEY = 'theme_colors';

export async function getThemeColors(): Promise<ThemeColors> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return { ...DEFAULT_COLORS };
    return { ...DEFAULT_COLORS, ...JSON.parse(raw) } as ThemeColors;
  } catch {
    return { ...DEFAULT_COLORS };
  }
}

export async function saveThemeColors(colors: ThemeColors): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(colors));
}
