import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type WealthOSLayoutProps = {
  header?: React.ReactNode;
  topContent?: React.ReactNode;
  whiteCardContent: React.ReactNode;
  navyColor?: string;
  whiteCardStyle?: ViewStyle;
  /**
   * Optional draggable white card.
   * - false: fixed 40/60 split.
   * - true: card can be dragged up toward full-screen.
   */
  draggable?: boolean;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;
const NAVY_RATIO = 0.4;
const WHITE_RATIO = 0.6;

/**
 * WealthOSLayout
 * Stack-based split-surface layout:
 * - Fixed navy layer at top 40%.
 * - White card layer at bottom 60% with 32 radius corners.
 * - Optional draggable behavior for the white card.
 */
export const WealthOSLayout: React.FC<WealthOSLayoutProps> = ({
  header,
  topContent,
  whiteCardContent,
  navyColor = '#0A0E21',
  whiteCardStyle,
  draggable = false,
}) => {
  const insets = useSafeAreaInsets();
  const navyHeight = useMemo(() => SCREEN_HEIGHT * NAVY_RATIO, []);
  const whiteTop = useMemo(() => SCREEN_HEIGHT * NAVY_RATIO, []);
  const whiteHeight = useMemo(() => SCREEN_HEIGHT * WHITE_RATIO, []);

  // Translate Y for draggable white card:
  // 0 => default 60% sheet, negative => expanded upward.
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const dragStartRef = useRef(0);
  const maxUpTranslate = -(SCREEN_HEIGHT * 0.5); // allows card to reach ~90-100% height

  const cardPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          draggable && Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          cardTranslateY.stopAnimation((v: number) => {
            dragStartRef.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = dragStartRef.current + g.dy;
          const clamped = Math.max(maxUpTranslate, Math.min(0, next));
          cardTranslateY.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          const current = dragStartRef.current + g.dy;
          const shouldExpand = g.vy < -0.4 || current < maxUpTranslate * 0.35;
          Animated.spring(cardTranslateY, {
            toValue: shouldExpand ? maxUpTranslate : 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 0,
          }).start();
        },
      }),
    [cardTranslateY, draggable, maxUpTranslate],
  );

  return (
    <View style={s.root}>
      {/* Bottom stack layer: fixed navy section */}
      <View
        style={[
          s.navyLayer,
          {
            backgroundColor: navyColor,
            height: navyHeight,
            paddingTop: insets.top,
          },
        ]}
      >
        {header ? <View style={s.headerWrap}>{header}</View> : null}
        <View style={s.topContentWrap}>{topContent}</View>
      </View>

      {/* Top stack layer: white card (fixed 60%, optionally draggable upward) */}
      <Animated.View
        style={[
          s.whiteCard,
          {
            top: whiteTop,
            height: whiteHeight,
            transform: [{ translateY: cardTranslateY }],
          },
          whiteCardStyle,
        ]}
        {...(draggable ? cardPanResponder.panHandlers : {})}
      >
        {whiteCardContent}
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0E21',
  },
  navyLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topContentWrap: {
    flex: 1,
  },
  whiteCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    zIndex: 2,
    overflow: 'hidden',
  },
});

