import { useRef, useState } from 'react';
import { View, PanResponder, StyleSheet, TextInput as RNTextInput } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { spacing, radius } from '../theme';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length !== 6) return [26, 86, 219];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0'))
    .join('');
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  return [h * 360, s * 100, v * 100];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h /= 360; s /= 100; v /= 100;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const cases: [number, number, number][] = [
    [v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q],
  ];
  const [r, g, b] = cases[i % 6];
  return [r * 255, g * 255, b * 255];
}

const SLIDER_H = 20;

function Slider({
  gradId, stops, value, onChange,
}: {
  gradId: string;
  stops: { offset: string; color: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  const widthRef = useRef(0);
  const pageXRef = useRef(0);

  function clamp(n: number) { return Math.max(0, Math.min(1, n)); }

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => onChange(clamp((e.nativeEvent.pageX - pageXRef.current) / widthRef.current)),
    onPanResponderMove: (e) => onChange(clamp((e.nativeEvent.pageX - pageXRef.current) / widthRef.current)),
  })).current;

  return (
    <View
      style={styles.sliderWrap}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        (e.target as any).measure((_: number, __: number, ___: number, ____: number, px: number) => {
          pageXRef.current = px;
        });
      }}
      {...pan.panHandlers}
    >
      <Svg width="100%" height={SLIDER_H} style={{ borderRadius: SLIDER_H / 2, overflow: 'hidden' }}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            {stops.map((s, i) => <Stop key={i} offset={s.offset} stopColor={s.color} />)}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={SLIDER_H} fill={`url(#${gradId})`} />
      </Svg>
      <View style={[styles.thumb, { left: `${value * 100}%` as any }]} />
    </View>
  );
}

export function HexColorPicker({ id, label, value, onChange }: Props) {
  const theme = useTheme();
  const [hexText, setHexText] = useState(value);

  if (hexText !== value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    setHexText(value);
  }

  const [hDeg, sPct, vPct] = rgbToHsv(...hexToRgb(value));

  function update(h: number, s: number, v: number) {
    const hex = rgbToHex(...hsvToRgb(h, s, v));
    setHexText(hex);
    onChange(hex);
  }

  const hueStops = [0, 60, 120, 180, 240, 300, 360].map((deg, i) => ({
    offset: `${Math.round((i / 6) * 100)}%`,
    color: rgbToHex(...hsvToRgb(Math.min(deg, 359), 100, 100)),
  }));

  const satStops = [
    { offset: '0%', color: rgbToHex(...hsvToRgb(hDeg, 0, vPct)) },
    { offset: '100%', color: rgbToHex(...hsvToRgb(hDeg, 100, vPct)) },
  ];

  const briStops = [
    { offset: '0%', color: '#000000' },
    { offset: '100%', color: rgbToHex(...hsvToRgb(hDeg, sPct, 100)) },
  ];

  function handleHexInput(text: string) {
    setHexText(text);
    const normalized = text.startsWith('#') ? text : `#${text}`;
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      onChange(normalized);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }]}>
      <View style={styles.header}>
        <View style={[styles.swatch, { backgroundColor: value }]} />
        <Text variant="labelMedium" style={{ color: theme.colors.onSurface, flex: 1, marginLeft: spacing.sm }}>
          {label}
        </Text>
        <RNTextInput
          value={hexText}
          onChangeText={handleHexInput}
          style={[styles.hexInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          selectTextOnFocus
        />
      </View>

      <Text variant="labelSmall" style={[styles.sliderLabel, { color: theme.colors.onSurfaceVariant }]}>Hue</Text>
      <Slider gradId={`${id}-h`} stops={hueStops} value={hDeg / 360} onChange={(n) => update(n * 360, sPct, vPct)} />

      <Text variant="labelSmall" style={[styles.sliderLabel, { color: theme.colors.onSurfaceVariant }]}>Saturation</Text>
      <Slider gradId={`${id}-s`} stops={satStops} value={sPct / 100} onChange={(n) => update(hDeg, n * 100, vPct)} />

      <Text variant="labelSmall" style={[styles.sliderLabel, { color: theme.colors.onSurfaceVariant }]}>Brightness</Text>
      <Slider gradId={`${id}-v`} stops={briStops} value={vPct / 100} onChange={(n) => update(hDeg, sPct, n * 100)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  swatch: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  hexInput: {
    fontSize: 13,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 80,
    textAlign: 'center',
  },
  sliderLabel: { marginTop: spacing.sm, marginBottom: 4 },
  sliderWrap: { height: SLIDER_H + 8, position: 'relative', justifyContent: 'center' },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: 'rgba(0,0,0,0.25)',
    top: -2,
    transform: [{ translateX: -12 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});
