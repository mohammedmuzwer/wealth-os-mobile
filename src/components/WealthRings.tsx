/**
 * WealthRings.tsx
 * Three concentric SVG progress rings for Wealth OS.
 *
 * PRD spec (Section 15):
 *   Outer  · Crimson #E53E3E  · Shield — daily spend control
 *   Middle · Electric Blue #3182CE · Track  — engagement / entries
 *   Inner  · Emerald #38A169  · Build  — monthly surplus sweep
 *   Size   · 130×130px (hero)  ·  32×32px (mini nav)
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import {
  SHIELD_RED, TRACK_BLUE, BUILD_GREEN, OVERSHIELD,
  getTierColor, getTierLabel,
  RING_SIZE, RING_STROKE, RING_GAP,
  TEXT_MUTED,
} from '../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WealthRingsProps {
  /** 0–100+: Shield ring fill. Can exceed 100 (over-completion). */
  shieldPct: number;
  /** 0–100+: Track ring fill. Can exceed 100. */
  trackPct: number;
  /** 0–100: Build ring fill. Hard-capped at 100. */
  buildPct: number;
  /** Composite wealth score 0–100. Shown in centre. */
  wealthScore: number;
  /** Overshield pre-fill percentage 0–75. Purple arc at base of Shield ring. */
  overshieldPct?: number;
  /** Diameter in dp. Defaults to PRD spec 130. */
  size?: number;
}

// ─── Ring constants ───────────────────────────────────────────────────────────

const RINGS = [
  { color: SHIELD_RED,  label: 'Shield' },
  { color: TRACK_BLUE,  label: 'Track'  },
  { color: BUILD_GREEN, label: 'Build'  },
] as const;

// ─── Animated Arc ─────────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ArcProps {
  cx: number; cy: number; radius: number;
  color: string; progress: number; // 0–1+ for over-completion
  strokeWidth?: number; opacity?: number;
}

const AnimatedRing: React.FC<ArcProps> = ({
  cx, cy, radius, color, progress, strokeWidth = RING_STROKE, opacity = 1,
}) => {
  const circumference = 2 * Math.PI * radius;
  // Cap at 1 for a single-lap render; over-completion handled by Lap2 layer
  const clampedProgress = Math.min(progress, 1);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: clampedProgress,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [clampedProgress]);

  const strokeDashoffset = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <G rotation="-90" origin={`${cx},${cy}`}>
      {/* Background track */}
      <Circle
        cx={cx} cy={cy} r={radius}
        stroke={color} strokeWidth={strokeWidth}
        strokeOpacity={0.15} fill="none"
      />
      {/* Animated fill arc */}
      <AnimatedCircle
        cx={cx} cy={cy} r={radius}
        stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        fill="none"
        opacity={opacity}
      />
    </G>
  );
};

// ─── Overshield Arc (static purple pre-fill at base of Shield ring) ───────────

interface OvershieldProps {
  cx: number; cy: number; radius: number; pct: number; strokeWidth: number;
}

const OvershieldArc: React.FC<OvershieldProps> = ({ cx, cy, radius, pct, strokeWidth }) => {
  if (pct <= 0) return null;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(pct / 100, 1);

  return (
    <G rotation="-90" origin={`${cx},${cy}`}>
      <Circle
        cx={cx} cy={cy} r={radius}
        stroke={OVERSHIELD}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fill)}
        fill="none"
        opacity={0.4}
      />
    </G>
  );
};

// ─── WealthRings ──────────────────────────────────────────────────────────────

export const WealthRings: React.FC<WealthRingsProps> = ({
  shieldPct,
  trackPct,
  buildPct,
  wealthScore,
  overshieldPct = 0,
  size = RING_SIZE,
}) => {
  const cx = size / 2;
  const cy = size / 2;

  const outerR  = cx - RING_STROKE / 2 - 3;
  const middleR = outerR  - RING_STROKE - RING_GAP;
  const innerR  = middleR - RING_STROKE - RING_GAP;

  const tierColor = getTierColor(wealthScore);
  const tierLabel = getTierLabel(wealthScore);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Overshield purple pre-fill (under Shield ring) */}
        <OvershieldArc cx={cx} cy={cy} radius={outerR} pct={overshieldPct} strokeWidth={RING_STROKE} />

        {/* Outer — Shield — Crimson */}
        <AnimatedRing cx={cx} cy={cy} radius={outerR}  color={RINGS[0].color} progress={shieldPct / 100} />
        {/* Middle — Track — Electric Blue */}
        <AnimatedRing cx={cx} cy={cy} radius={middleR} color={RINGS[1].color} progress={trackPct  / 100} />
        {/* Inner — Build — Emerald */}
        <AnimatedRing cx={cx} cy={cy} radius={innerR}  color={RINGS[2].color} progress={Math.min(buildPct, 100) / 100} />
      </Svg>

      {/* Centre score */}
      <View style={styles.centre} pointerEvents="none">
        <Text style={[styles.scoreValue, { color: tierColor }]}>{wealthScore}</Text>
        <Text style={[styles.scoreTier,  { color: tierColor }]}>{tierLabel}</Text>
      </View>

      {/* Legend row */}
      <View style={styles.legend}>
        {[
          { label: 'Shield', pct: shieldPct, color: RINGS[0].color },
          { label: 'Track',  pct: trackPct,  color: RINGS[1].color },
          { label: 'Build',  pct: buildPct,  color: RINGS[2].color },
        ].map(({ label, pct, color }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label} {Math.round(pct)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  centre: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 28,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  scoreTier: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: TEXT_MUTED,
    fontWeight: '600',
  },
});
