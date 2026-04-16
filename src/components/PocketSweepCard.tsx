import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { FONT_MONO, RADIUS_LG } from '../theme/tokens';

const YELLOW = '#FFD700';
const YELLOW_DARK = '#1A1005';
const VIOLET = '#7C3AED';
const VIOLET_LIGHT = '#C4B5FD';
const TRACK_MAX = '#2D2D3A';
const D = {
  muted: 'rgba(255,255,255,0.42)',
};

const SPRING = { damping: 16, stiffness: 120, mass: 0.8 };

type PocketSweepCardProps = {
  cardSize: number;
  rightOffset: number;
  isFlipped: boolean;
  setIsFlipped: (next: boolean) => void;
  pocketSplitPct: number;
  onPocketSplitChange: (next: number) => void;
  onDone: () => void;
  onPocketNow: () => void;
  pocketDisplay: number;
  unspent: number;
  pocketButtonRef?: React.RefObject<View>;
};

export const PocketSweepCard: React.FC<PocketSweepCardProps> = ({
  cardSize,
  rightOffset,
  isFlipped,
  setIsFlipped,
  pocketSplitPct,
  onPocketSplitChange,
  onDone,
  onPocketNow,
  pocketDisplay,
  unspent,
  pocketButtonRef,
}) => {
  const flipProgress = useSharedValue(isFlipped ? 1 : 0);
  const safePocketSplitPct = Number.isFinite(pocketSplitPct) ? Math.max(10, Math.min(90, Math.round(pocketSplitPct))) : 50;
  const safePocketDisplay = Number.isFinite(pocketDisplay) ? Math.max(0, Math.floor(pocketDisplay)) : 0;
  const safeUnspent = Number.isFinite(unspent) ? Math.max(0, unspent) : 0;

  React.useEffect(() => {
    flipProgress.value = withSpring(isFlipped ? 1 : 0, SPRING);
  }, [flipProgress, isFlipped]);

  const wrapperAnimatedStyle = useAnimatedStyle(() => {
    const cardWidth = interpolate(flipProgress.value, [0, 1], [cardSize, cardSize / 0.48]);
    return {
      width: cardWidth,
      zIndex: flipProgress.value > 0 ? 999 : 1,
      elevation: Platform.OS === 'android' ? (flipProgress.value > 0 ? 999 : 1) : 0,
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

  const savingsAmt = Math.floor(safeUnspent * (safePocketSplitPct / 100));
  const healAmt = Math.floor(safeUnspent * ((100 - safePocketSplitPct) / 100));

  return (
    <Animated.View style={[s.wrap, { right: rightOffset, height: cardSize }, wrapperAnimatedStyle]}>
      <Animated.View style={[s.face, frontAnimatedStyle]} pointerEvents={isFlipped ? 'none' : 'auto'}>
        <TouchableOpacity style={s.frontCard} activeOpacity={0.92} onPress={() => setIsFlipped(true)}>
          <View style={s.frontTop}>
            <View style={s.iconBadge}>
              <Text style={s.icon}>💛</Text>
            </View>
            <View ref={pocketButtonRef} collapsable={false}>
              <TouchableOpacity style={s.pocketBtn} activeOpacity={0.9} onPress={onPocketNow}>
                <Text style={s.pocketBtnIcon}>◎</Text>
                <Text style={s.pocketBtnTxt}>POCKET{'\n'}NOW</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.frontBottom}>
            <Text style={s.frontLabel}>POCKET IT</Text>
            <Text style={s.frontAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>₹{safePocketDisplay}</Text>
            <Text style={s.frontSub}>Available to Pocket</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[s.backFace, backAnimatedStyle]} pointerEvents={isFlipped ? 'auto' : 'none'}>
        <View style={s.backContent}>
          <View style={s.backTopRow}>
            <Text style={s.backLabelMuted}>POCKET SPLIT</Text>
          </View>
          <Text style={s.backSub}>How much of your unspent budget goes to savings?</Text>
          <Text style={s.backPct}>{safePocketSplitPct}%</Text>
          <View style={s.sliderSection}>
            <Text style={s.sliderHint}>Adjust your pocket split</Text>
            <Slider
              style={s.slider}
              minimumValue={10}
              maximumValue={90}
              step={5}
              value={safePocketSplitPct}
              onValueChange={val => onPocketSplitChange(Math.round(val))}
              minimumTrackTintColor={VIOLET}
              maximumTrackTintColor={TRACK_MAX}
              thumbTintColor={VIOLET_LIGHT}
            />
            <View style={s.amountRow}>
              <Text style={s.amountTxt}>Savings    ₹{savingsAmt}</Text>
              <Text style={s.amountTxt}>Future days  ₹{healAmt}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={s.doneBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={s.doneBtnTxt}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    borderRadius: RADIUS_LG,
    overflow: 'hidden',
    zIndex: 1,
  },
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
    shadowColor: YELLOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  frontTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
    backgroundColor: '#1A1A2E',
    borderRadius: RADIUS_LG,
    padding: 14,
    justifyContent: 'space-between',
  },
  backContent: { flexShrink: 1 },
  backTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backLabelMuted: {
    fontSize: 9,
    fontWeight: '800',
    color: D.muted,
    letterSpacing: 1,
  },
  backSub: {
    marginTop: 6,
    color: D.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  backPct: {
    marginTop: 6,
    color: VIOLET,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -1,
    fontFamily: FONT_MONO as string,
  },
  sliderSection: {
    marginTop: 4,
    marginBottom: 0,
  },
  sliderHint: {
    fontSize: 11,
    fontWeight: '600',
    color: D.muted,
    marginBottom: 2,
  },
  slider: { width: '100%', height: 30 },
  amountRow: { marginTop: 4, gap: 2 },
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
  },
  doneBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
