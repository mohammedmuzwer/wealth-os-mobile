import React from 'react';
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
  muted: 'rgba(255,255,255,0.42)',
};
const YELLOW = '#FFD700';
const YELLOW_DARK = '#1A1005';
const VIOLET = '#7C3AED';
const VIOLET_LIGHT = '#C4B5FD';
const TRACK_MAX = '#2D2D3A';

const SPRING = { damping: 16, stiffness: 120, mass: 0.8 };

type PocketSplitCardProps = {
  cardSize: number;
  rightOffset: number;
  pocketSplitPct: number;
  setPocketSplitPct: (n: number) => void;
  unspent: number;
  onPocketNow: () => void;
  onDone: () => Promise<void> | void;
  pocketButtonRef?: React.RefObject<View>;
};

export const PocketSplitCard: React.FC<PocketSplitCardProps> = ({
  cardSize,
  rightOffset,
  pocketSplitPct,
  setPocketSplitPct,
  unspent,
  onPocketNow,
  onDone,
  pocketButtonRef,
}) => {
  const flipProgress = useSharedValue(0);

  const safeSplit = Number.isFinite(pocketSplitPct) ? Math.max(10, Math.min(90, Math.round(pocketSplitPct))) : 50;
  const safeUnspent = Number.isFinite(unspent) ? Math.max(0, unspent) : 0;
  const safePocket = Math.floor(safeUnspent * (safeSplit / 100));
  const savingsAmt = Math.floor(safeUnspent * (safeSplit / 100));
  const healAmt = Math.floor(safeUnspent * ((100 - safeSplit) / 100));

  const openFlip = () => {
    flipProgress.value = withSpring(1, SPRING);
  };

  const closeFlip = () => {
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

  const onDonePress = async () => {
    await onDone();
    closeFlip();
  };

  return (
    <Animated.View style={[{ position: 'absolute', right: rightOffset, height: cardSize, borderRadius: 24 }, wrapperAnimatedStyle]}>
      <Animated.View style={[styles.face, frontAnimatedStyle]}>
        <Pressable style={({ pressed }) => [styles.frontCard, pressed && styles.frontCardPressed]} onPress={openFlip}>
          <View style={styles.frontTop}>
            <View style={styles.iconBadge}>
              <Text style={styles.icon}>💛</Text>
            </View>
            <View ref={pocketButtonRef} collapsable={false}>
              <TouchableOpacity style={styles.pocketBtn} activeOpacity={0.9} onPress={onPocketNow}>
                <Text style={styles.pocketBtnIcon}>◎</Text>
                <Text style={styles.pocketBtnTxt}>POCKET{'\n'}NOW</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.frontBottom}>
            <Text style={styles.frontLabel}>POCKET IT</Text>
            <Text style={styles.frontAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              ₹{safePocket}
            </Text>
            <Text style={styles.frontSub}>Available to Pocket</Text>
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.backFace, backAnimatedStyle]}>
        <View style={styles.backContent}>
          <View style={styles.backTopRow}>
            <Text style={styles.backLabelMuted}>POCKET SPLIT</Text>
            <Text style={styles.backLabelMuted}>SPLIT %</Text>
          </View>
          <Text style={styles.backSub}>How much of your unspent budget goes to savings?</Text>

          <View style={styles.backValuesRow}>
            <Text style={styles.backAmountPurple}>{safeSplit}%</Text>
            <Text style={styles.backAmountMuted}>of unspent</Text>
          </View>

          <View style={styles.sliderSection}>
            <Slider
              style={styles.slider}
              minimumValue={10}
              maximumValue={90}
              step={5}
              value={safeSplit}
              onValueChange={(val) => {
                const next = Math.round(Number(val));
                setPocketSplitPct(next);
                console.log('pocketSplitPct changed to:', val);
              }}
              onSlidingComplete={(val) => {
                const next = Math.round(Number(val));
                setPocketSplitPct(next);
                console.log('pocketSplitPct sliding complete:', next);
              }}
              minimumTrackTintColor={VIOLET}
              maximumTrackTintColor={TRACK_MAX}
              thumbTintColor={VIOLET_LIGHT}
            />
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountTxt}>Savings  ₹{savingsAmt}</Text>
            <Text style={styles.amountTxt}>Future  ₹{healAmt}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.doneBtn} onPress={onDonePress} activeOpacity={0.85}>
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
  frontCard: {
    flex: 1,
    backgroundColor: YELLOW,
    borderRadius: RADIUS_LG,
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: YELLOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  frontCardPressed: { opacity: 0.92 },
  frontTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 13 },
  pocketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: YELLOW,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.20)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    minHeight: 30,
  },
  pocketBtnIcon: { fontSize: 11, color: YELLOW_DARK },
  pocketBtnTxt: {
    fontSize: 7,
    fontWeight: '900',
    color: YELLOW_DARK,
    letterSpacing: 0.35,
    lineHeight: 8.5,
    textAlign: 'center',
  },
  frontBottom: { gap: 1 },
  frontLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(0,0,0,0.5)', letterSpacing: 1 },
  frontAmount: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
    color: YELLOW_DARK,
    letterSpacing: -1,
    fontFamily: FONT_MONO as string,
  },
  frontSub: { fontSize: 9, fontWeight: '700', color: 'rgba(0,0,0,0.45)', letterSpacing: 0.5 },
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
  backSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: D.muted,
    lineHeight: 15,
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
  backAmountMuted: {
    fontSize: 13,
    fontWeight: '800',
    color: D.muted,
    fontFamily: FONT_MONO as string,
  },
  sliderSection: {
    marginTop: 4,
    marginBottom: 0,
  },
  slider: { width: '100%', height: 34, zIndex: 1 },
  amountRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  amountTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: D.muted,
  },
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
