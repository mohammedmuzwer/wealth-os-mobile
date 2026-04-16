import React from 'react';
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { FONT_MONO, FONT_UI } from '../theme/tokens';

type AppPageHeaderProps = {
  title: string;
  ovrScore: number;
  shieldPct: number;
  trackPct: number;
  buildPct: number;
  onBack?: () => void;
  theme?: 'dark' | 'light';
};

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
  const value = parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const mixHex = (fromHex: string, toHex: string, t: number) => {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const n = Math.max(0, Math.min(1, t));
  const r = Math.round(from.r + (to.r - from.r) * n);
  const g = Math.round(from.g + (to.g - from.g) * n);
  const b = Math.round(from.b + (to.b - from.b) * n);
  return `rgb(${r}, ${g}, ${b})`;
};

const getSmoothShieldColor = (percent: number) => {
  const p = Math.max(0, Math.min(1, percent));
  if (p <= 0.1) return '#888888';
  if (p <= 0.3) return mixHex('#888888', '#FF6B00', (p - 0.1) / 0.2);
  if (p <= 0.5) return mixHex('#FF6B00', '#D69E2E', (p - 0.3) / 0.2);
  return mixHex('#D69E2E', '#E53E3E', (p - 0.5) / 0.5);
};

const MiniRings: React.FC<{ shieldPct: number; trackPct: number; buildPct: number }> = ({ shieldPct, trackPct, buildPct }) => {
  const S = 20;
  const cx = S / 2;
  const cy = S / 2;
  const sw = 2;
  const rO = 8;
  const rM = 5.5;
  const rI = 3;
  const renderArc = (r: number, color: string, progress: number) => {
    const circ = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(progress, 1));
    const offset = circ * (1 - p);
    return (
      <G rotation="-90" origin={`${cx},${cy}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} strokeOpacity={0.2} fill="none" />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          fill="none"
        />
      </G>
    );
  };

  return (
    <View style={styles.miniRingsWrap}>
      <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        {renderArc(rO, getSmoothShieldColor(shieldPct / 100), shieldPct / 100)}
        {renderArc(rM, '#34C759', trackPct / 100)}
        {renderArc(rI, '#32ADE6', buildPct / 100)}
      </Svg>
    </View>
  );
};

export const AppPageHeader: React.FC<AppPageHeaderProps> = ({
  title,
  ovrScore,
  shieldPct,
  trackPct,
  buildPct,
  onBack,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  return (
    <View
      style={[
        styles.row,
        {
          paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : 8,
          height: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 52 : 52,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onBack?.()}
        style={[styles.backBtn, isLight ? styles.backBtnLight : null]}
      >
        <Text style={[styles.backTxt, isLight ? styles.backTxtLight : null]}>‹</Text>
      </TouchableOpacity>

      <Text style={[styles.title, isLight ? styles.titleLight : null]}>{title}</Text>

      <View style={{ flex: 1 }} />

      <View style={[styles.ovsPill, isLight ? styles.ovsPillLight : null]}>
        <MiniRings shieldPct={shieldPct} trackPct={trackPct} buildPct={buildPct} />
        <Text style={[styles.ovsTxt, isLight ? styles.ovsTxtLight : null]}>OVR {Math.round(ovrScore)}</Text>
      </View>

      <TouchableOpacity activeOpacity={0.85} style={[styles.bellWrap, isLight ? styles.bellWrapLight : null]}>
        <Text style={styles.bellIcon}>🔔</Text>
        <View style={[styles.bellDot, isLight ? styles.bellDotLight : null]} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnLight: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  backTxt: { color: '#fff', fontSize: 20, lineHeight: 22 },
  backTxtLight: { color: '#111827' },
  title: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: FONT_UI as string,
  },
  titleLight: { color: '#111827' },
  ovsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    gap: 4,
  },
  ovsPillLight: { backgroundColor: '#E9ECEF' },
  ovsTxt: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_MONO as string,
    fontWeight: '600',
  },
  ovsTxtLight: { color: '#0F172A' },
  miniRingsWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellWrapLight: { backgroundColor: '#F3F4F6' },
  bellIcon: { fontSize: 18 },
  bellDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#34C759',
    borderWidth: 1.5,
    borderColor: '#0A0E21',
  },
  bellDotLight: {
    borderColor: '#FFFFFF',
  },
});
