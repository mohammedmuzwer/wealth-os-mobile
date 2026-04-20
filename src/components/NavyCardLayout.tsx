/**
 * NavyCardLayout.tsx
 *
 * Reusable navy-top / white-card-bottom shell for every WealthOS page.
 * Every page that uses the two-tone split layout should use this component
 * instead of rebuilding the animated card from scratch.
 *
 * Animation pattern: identical to SpendingScrollBody and WealthScreen —
 * react-native Animated.Value + PanResponder, spring snap between two positions.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NavyCardLayoutProps {
  /** Content rendered in the fixed navy top section */
  navyContent: React.ReactNode;
  /** Content rendered inside the scrollable white card */
  cardContent: React.ReactNode;
  /**
   * How much of the screen height the navy section occupies (0.0–1.0).
   * Also the default collapsed position for the white card.
   * Default: 0.42
   */
  navyFlex?: number;
  /**
   * Collapsed snap position as a fraction of screen height.
   * Defaults to navyFlex when not provided.
   */
  cardSnapMin?: number;
  /**
   * Expanded snap position as a fraction of screen height.
   * Default: 0.12  (card covers nearly the full screen)
   */
  cardSnapMax?: number;
  /**
   * Additional px offset added to the expanded position (e.g. safe-area top).
   * Default: 0
   */
  headerOffset?: number;
}

// ─── Spring config — matches SpendingScrollBody's SHEET_SPRING ───────────────

const SPRING = {
  tension: 65,
  friction: 11,
  overshootClamping: true,
  useNativeDriver: false,
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const NavyCardLayout: React.FC<NavyCardLayoutProps> = ({
  navyContent,
  cardContent,
  navyFlex = 0.42,
  cardSnapMin,
  cardSnapMax = 0.12,
  headerOffset = 0,
}) => {
  const { height: screenH } = Dimensions.get('window');

  // Snap positions in px from the top of the screen
  const minimizedTop = Math.round(screenH * (cardSnapMin ?? navyFlex));
  const expandedTop = Math.round(screenH * cardSnapMax) + headerOffset;

  // Animated value drives the card's `top` style
  const sheetTop = useRef(new Animated.Value(minimizedTop)).current;

  // Mutable refs shared safely with PanResponder callbacks (no stale closure)
  const startTopRef = useRef(minimizedTop);
  const trackedTopRef = useRef(minimizedTop);
  const currentTopRef = useRef(minimizedTop);
  const scrollYRef = useRef(0);

  // Drive scrollEnabled on the inner ScrollView so swipe takes priority when collapsed
  const [isExpanded, setIsExpanded] = useState(false);

  // Re-sync when navyFlex / cardSnapMin changes (e.g. orientation change)
  useEffect(() => {
    startTopRef.current = minimizedTop;
    trackedTopRef.current = minimizedTop;
    currentTopRef.current = minimizedTop;
    setIsExpanded(false);
    sheetTop.stopAnimation();
    sheetTop.setValue(minimizedTop);
  }, [minimizedTop, sheetTop]);

  // ─── PanResponder — exact pattern from SpendingScrollBody ─────────────────

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          // Ignore if gesture is more horizontal than vertical, or too short
          if (Math.abs(g.dy) <= Math.abs(g.dx) || Math.abs(g.dy) <= 5) return false;
          // Let the inner ScrollView handle gestures when content is scrolled down
          if (scrollYRef.current > 2) return false;
          const topNow = trackedTopRef.current;
          // Swipe-up only when near collapsed; swipe-down only when near expanded
          if (g.dy < 0) return topNow >= minimizedTop - 10;
          if (g.dy > 0) return topNow <= minimizedTop - 10;
          return false;
        },
        onPanResponderGrant: () => {
          sheetTop.stopAnimation((value: number) => {
            startTopRef.current = value;
            trackedTopRef.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = startTopRef.current + g.dy;
          const clamped = Math.max(expandedTop, Math.min(minimizedTop, next));
          currentTopRef.current = clamped;
          trackedTopRef.current = clamped;
          sheetTop.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          const range = minimizedTop - expandedTop;
          const mid = expandedTop + range * 0.5;
          const pos = currentTopRef.current;

          // Velocity flick overrides midpoint threshold
          let toValue: number;
          if (g.vy < -0.22) toValue = expandedTop;
          else if (g.vy > 0.22) toValue = minimizedTop;
          else toValue = pos < mid ? expandedTop : minimizedTop;

          const vy = Math.max(-2800, Math.min(2800, g.vy));
          Animated.spring(sheetTop, { toValue, ...SPRING, velocity: vy }).start(
            ({ finished }) => {
              if (finished) {
                trackedTopRef.current = toValue;
                setIsExpanded(toValue === expandedTop);
              }
            },
          );
        },
        onPanResponderTerminate: () => {
          Animated.spring(sheetTop, {
            toValue: minimizedTop,
            ...SPRING,
            velocity: 0,
          }).start(() => {
            trackedTopRef.current = minimizedTop;
            setIsExpanded(false);
          });
        },
      }),
    [expandedTop, minimizedTop, sheetTop],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      {/* Navy section — fixed height, not scrollable */}
      <View style={[s.navySection, { height: Math.round(screenH * navyFlex) }]}>
        {navyContent}
      </View>

      {/* White swipe card — absolutely positioned over the navy background */}
      <Animated.View
        style={[s.card, { top: sheetTop }]}
        {...panResponder.panHandlers}
      >
        {/* Drag handle — both the zone and the pill get the pan handlers
            so the full top strip responds to drags */}
        <View style={s.handleZone} {...panResponder.panHandlers}>
          <View style={s.handle} />
        </View>

        {/* Scrollable card content.
            scrollEnabled is false while collapsed so vertical swipes expand
            the card rather than scroll the content. */}
        <ScrollView
          scrollEnabled={isExpanded}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          contentContainerStyle={s.scrollContent}
          onScroll={e => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
        >
          {cardContent}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  navySection: {
    // Height is set inline via the navyFlex prop
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 5,
    // Shadow gives the card slight elevation above the navy background
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E2F5',
    marginBottom: 12,
  },
  scrollContent: {
    paddingBottom: 100, // clears the floating nav bar
  },
});
