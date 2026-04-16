import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

const palette = {
  primary: '#1a56db',
  primaryLight: '#3b82f6',
  primaryDark: '#1e40af',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  surface: '#ffffff',
  surfaceVariant: '#f3f4f6',
  onSurface: '#111827',
  onSurfaceVariant: '#6b7280',
  border: '#e5e7eb',
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: '#ffffff',
    primaryContainer: '#dbeafe',
    secondary: palette.primaryLight,
    surface: palette.surface,
    surfaceVariant: palette.surfaceVariant,
    onSurface: palette.onSurface,
    onSurfaceVariant: palette.onSurfaceVariant,
    error: palette.error,
    outline: palette.border,
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.primaryLight,
    onPrimary: '#ffffff',
    primaryContainer: '#1e3a8a',
    secondary: palette.primary,
    surface: '#1f2937',
    surfaceVariant: '#111827',
    onSurface: '#f9fafb',
    onSurfaceVariant: '#9ca3af',
    error: palette.error,
    outline: '#374151',
    background: '#0f172a',
  },
};

export { palette };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;
