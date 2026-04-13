/**
 * SubscriptionHero.tsx
 * Top card for the Subscription screen.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │  Track Spending          [badge]    │
 *   │  ₹2,450 / mo  (DM Mono style)      │
 *   │  Total Monthly Cost                 │
 *   │  -₹82 from Daily Budget            │
 *   │  ────────────────────────────────  │
 *   │  [████████████████░░░░░░░░░░░░░]   │
 *   │   Entertainment 60%  Utility 40%   │
 *   └─────────────────────────────────────┘
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { CategorySplit } from '../hooks/useSubscriptions';
import { PURPLE, PURPLE_BG, DANGER, FONT_MONO } from '../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionHeroProps {
  totalMonthly: number;
  dailyImpact: number;
  splits: CategorySplit[];
}

// ─── Split Bar ────────────────────────────────────────────────────────────────

const SplitBar: React.FC<{ splits: CategorySplit[] }> = ({ splits }) => {
  const anims = useRef(splits.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      120,
      anims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: splits[i].pct,
          duration: 700,
          useNativeDriver: false,
        }),
      ),
    ).start();
  }, []);

  return (
    <View style={bar.wrapper}>
      {/* Bar track */}
      <View style={bar.track}>
        {splits.map((split, i) => {
          const width = anims[i].interpolate({
            inputRange:  [0, 100],
            outputRange: ['0%', '100%'],
          });
          return (
            <Animated.View
              key={split.label}
              style={[
                bar.segment,
                {
                  backgroundColor: split.color,
                  width,
                  borderTopLeftRadius:    i === 0 ? 6 : 0,
                  borderBottomLeftRadius: i === 0 ? 6 : 0,
                  borderTopRightRadius:    i === splits.length - 1 ? 6 : 0,
                  borderBottomRightRadius: i === splits.length - 1 ? 6 : 0,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Labels */}
      <View style={bar.labels}>
        {splits.map(split => (
          <View key={split.label} style={bar.labelGroup}>
            <View style={[bar.dot, { backgroundColor: split.color }]} />
            <Text style={bar.labelText}>
              {split.label}{' '}
              <Text style={[bar.pctText, { color: split.color }]}>{split.pct}%</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── SubscriptionHero ─────────────────────────────────────────────────────────

export const SubscriptionHero: React.FC<SubscriptionHeroProps> = ({
  totalMonthly,
  dailyImpact,
  splits,
}) => {
  const formatted = `₹${totalMonthly.toLocaleString('en-IN')}`;

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Track Spending</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>FIXED</Text>
        </View>
      </View>

      {/* Amount */}
      <Text style={styles.amount}>{formatted}</Text>
      <Text style={styles.amountLabel}>Total Monthly Cost&nbsp;/&nbsp;mo</Text>

      {/* Daily impact */}
      <View style={styles.impactRow}>
        <Text style={styles.impactIcon}>📉</Text>
        <Text style={styles.impactText}>
          -{'\u20B9'}{dailyImpact} from Daily Budget
        </Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Split bar */}
      <SplitBar splits={splits} />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
  },
  badge: {
    backgroundColor: PURPLE_BG,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: PURPLE,
    letterSpacing: 1,
  },
  amount: {
    fontFamily: FONT_MONO,
    fontSize: 38,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -1,
    lineHeight: 44,
  },
  amountLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 10,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 18,
  },
  impactIcon: {
    fontSize: 13,
  },
  impactText: {
    fontSize: 13,
    fontWeight: '600',
    color: DANGER,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 16,
  },
});

const bar = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  track: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  segment: {
    height: '100%',
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  pctText: {
    fontWeight: '800',
    fontSize: 12,
  },
});
