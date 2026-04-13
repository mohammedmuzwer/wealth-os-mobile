/**
 * SmartInsight.tsx
 * Small insight card shown below the hero on the Subscription screen.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  ✦  You have 3 renewals this week.       │
 *   │     Clearing unused subs boosts your     │
 *   │     Daily Budget ceiling instantly.      │
 *   └──────────────────────────────────────────┘
 */

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { PURPLE, PURPLE_BG, TEXT_BODY, TEXT_MUTED } from '../theme/tokens';

interface SmartInsightProps {
  renewalCount: number;
}

export const SmartInsight: React.FC<SmartInsightProps> = ({ renewalCount }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>✦</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.headline}>
          You have{' '}
          <Text style={styles.highlight}>{renewalCount} renewals</Text>
          {' '}this week.
        </Text>
        <Text style={styles.body}>
          Clearing unused subs boosts your Daily Budget ceiling instantly.
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: PURPLE,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: PURPLE_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  icon: {
    fontSize: 15,
    color: PURPLE,
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  headline: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_BODY,
    lineHeight: 18,
  },
  highlight: {
    color: PURPLE,
    fontWeight: '800',
  },
  body: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 17,
  },
});
