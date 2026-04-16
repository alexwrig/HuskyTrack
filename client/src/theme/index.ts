import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + amount, g + amount, b + amount);
}

function darken(hex: string, amount: number): string {
  return lighten(hex, -amount);
}

function withOpacity(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export { withOpacity };

// ── Theme builders ────────────────────────────────────────────────────────────

export function buildLightTheme(primary: string, accent: string): MD3Theme {
  return {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary,
      onPrimary: '#ffffff',
      primaryContainer: lighten(primary, 180),
      onPrimaryContainer: darken(primary, 30),
      secondary: accent,
      onSecondary: '#ffffff',
      secondaryContainer: lighten(accent, 180),
      surface: '#ffffff',
      surfaceVariant: '#f3f4f6',
      onSurface: '#111827',
      onSurfaceVariant: '#6b7280',
      error: '#ef4444',
      outline: '#e5e7eb',
      background: '#f9fafb',
      onBackground: '#111827',
    },
  };
}

export function buildDarkTheme(primary: string, accent: string): MD3Theme {
  return {
    ...MD3DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      primary: lighten(primary, 60),
      onPrimary: '#ffffff',
      primaryContainer: darken(primary, 10),
      onPrimaryContainer: lighten(primary, 180),
      secondary: lighten(accent, 60),
      onSecondary: '#ffffff',
      surface: '#1f2937',
      surfaceVariant: '#111827',
      onSurface: '#f9fafb',
      onSurfaceVariant: '#9ca3af',
      error: '#ef4444',
      outline: '#374151',
      background: '#0f172a',
      onBackground: '#f9fafb',
    },
  };
}

// ── Static default themes (used before context loads) ─────────────────────────

const DEFAULT_PRIMARY = '#1a56db';
const DEFAULT_ACCENT = '#6366f1';

export const lightTheme = buildLightTheme(DEFAULT_PRIMARY, DEFAULT_ACCENT);
export const darkTheme = buildDarkTheme(DEFAULT_PRIMARY, DEFAULT_ACCENT);

// ── Palette (for non-themed usage in charts / icons) ─────────────────────────

export const palette = {
  primary: DEFAULT_PRIMARY,
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

// High-contrast chart colors for multi-series data
export const CHART_COLORS = [
  '#1a56db', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
  '#ec4899', '#6366f1',
];
