/**
 * DailyBudgetCard — 3D flip (Reanimated) + slider on back face.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { FONT_MONO, RADIUS_LG } from '../theme/tokens';

const D = {
  card: '#161B27',
  muted: 'rgba(255,255,255,0.42)',
};
const VIOLET = '#7C3AED';
const VIOLET_LIGHT = '#C4B5FD';
const TRACK_MAX = '#2D2D3A';
const CRITICAL_RED = '#E53E3E';

const SPRING = { damping: 16, stiffness: 120, mass: 0.8 };

export interface DailyBudgetCardProps {
  cardSize: number;
  leftOffset?: number;
  dailySpent: number;
  dailyLimit: number;
  setDailyLimit: (n: number) => void;
  /** Upper bound for slider & red marker (e.g. income-derived critical cap). */
  criticalLimit: number;
  sliderMin?: number;
  arcSlot: React.ReactNode;
}

export const DailyBudgetCard: React.FC<DailyBudgetCardProps> = ({
  cardSize,
  leftOffset = 0,
  dailySpent,
  dailyLimit,
  setDailyLimit,
  criticalLimit,
  sliderMin = 50,
  arcSlot,
}) => {
  const flipProgress = useSharedValue(0);
  const [tempLimit, setTempLimit] = useState(dailyLimit);

  const sliderMax = Math.max(criticalLimit, dailyLimit + 200, sliderMin + 100);
  const markerPct = Math.min(
    1,
    Math.max(0, (criticalLimit - sliderMin) / (sliderMax - sliderMin)),
  );

  const openFlip = () => {
    setTempLimit(dailyLimit);
    flipProgress.value = withSpring(1, SPRING);
  };

  const closeFlip = () => {
    setDailyLimit(tempLimit);
    flipProgress.value = withSpring(0, SPRING);
  };

  const wrapperAnimatedStyle = useAnimatedStyle(() => {
    const cardWidth = interpolate(flipProgress.value, [0, 1], [cardSize, cardSize / 0.48]);
    return {
      width: cardWidth,
      zIndex: flipProgress.value > 0 ? 999 : 2,
      elevation: Platform.OS === 'android' ? (flipProgress.value > 0 ? 999 : 2) : 0,
    };
  });

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: flipProgress.value < 0.5 ? 1 : 0,
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: flipProgress.value > 0.5 ? 1 : 0,
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', left: leftOffset, height: cardSize, borderRadius: 24 }, wrapperAnimatedStyle]}>
        <Animated.View style={[styles.face, frontAnimatedStyle]}>
          <Pressable
            style={({ pressed }) => [styles.budgetCard, pressed && styles.budgetCardPressed]}
            onPress={openFlip}
          >
            <View style={styles.budgetTop}>
              <View style={styles.heartBadge}>
                <Text style={styles.heartIcon}>💗</Text>
              </View>
              {arcSlot}
            </View>
            <View style={styles.budgetBottom}>
              <Text style={styles.cardLabel}>DAILY BUDGET</Text>
              <View style={styles.ratioRow}>
                <Text
                  style={styles.ratioSpend}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  ₹{dailySpent.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.ratioLimit}>
                  / {dailyLimit.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.backFace, backAnimatedStyle]}>
          <View style={styles.backContent}>
            <View style={styles.backTopRow}>
              <Text style={styles.backLabelMuted}>DAILY BUDGET</Text>
              <Text style={styles.backCriticalTag}>CRITICAL LIMIT</Text>
            </View>
            <View style={styles.backValuesRow}>
              <Text
                style={styles.backAmountPurple}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                ₹{Math.round(tempLimit).toLocaleString('en-IN')}
              </Text>
              <Text style={styles.backAmountRed}>
                ₹{criticalLimit.toLocaleString('en-IN')}
              </Text>
            </View>

            <View style={styles.sliderSection}>
              <Text style={styles.sliderHint}>Adjust your daily cap</Text>
              <View style={styles.sliderTrackWrap}>
                <View
                  pointerEvents="none"
                  style={[styles.criticalMarker, { left: `${markerPct * 100}%` }]}
                />
                <Slider
                  style={styles.slider}
                  minimumValue={sliderMin}
                  maximumValue={sliderMax}
                  value={tempLimit}
                  onValueChange={val => setTempLimit(Math.round(val))}
                  minimumTrackTintColor={VIOLET}
                  maximumTrackTintColor={TRACK_MAX}
                  thumbTintColor={VIOLET_LIGHT}
                />
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.doneBtn} onPress={closeFlip} activeOpacity={0.85}>
            <Text style={styles.doneBtnTxt}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  face: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  budgetCard: {
    flex: 1,
    backgroundColor: D.card,
    borderRadius: RADIUS_LG,
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  budgetCardPressed: { opacity: 0.92 },
  budgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heartBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIcon: { fontSize: 16 },
  budgetBottom: { gap: 2, width: '100%', minWidth: 0 },
  cardLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: D.muted,
    letterSpacing: 1,
  },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
    minWidth: 0,
    gap: 4,
  },
  ratioSpend: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    fontFamily: FONT_MONO as string,
  },
  ratioLimit: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.38)',
    fontFamily: FONT_MONO as string,
  },
  backFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    padding: 14,
    flex: 1,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  backContent: {
    flexShrink: 1,
  },
  backTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backLabelMuted: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
  },
  backCriticalTag: {
    fontSize: 8,
    fontWeight: '800',
    color: CRITICAL_RED,
    letterSpacing: 0.8,
  },
  backValuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 0,
  },
  backAmountPurple: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: VIOLET,
    letterSpacing: -1,
    fontFamily: FONT_MONO as string,
  },
  backAmountRed: {
    fontSize: 13,
    fontWeight: '800',
    color: CRITICAL_RED,
    fontFamily: FONT_MONO as string,
  },
  sliderSection: {
    marginTop: 4,
    marginBottom: 0,
  },
  sliderHint: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 4,
  },
  sliderTrackWrap: {
    position: 'relative',
    justifyContent: 'center',
    minHeight: 30,
  },
  criticalMarker: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    width: 3,
    marginLeft: -1.5,
    backgroundColor: CRITICAL_RED,
    borderRadius: 2,
    opacity: 0.95,
    zIndex: 0,
  },
  slider: { width: '100%', height: 30, zIndex: 1 },
  doneBtn: {
    width: '100%',
    height: 40,
    borderRadius: 12,
    backgroundColor: VIOLET,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 0,
  },
  doneBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
