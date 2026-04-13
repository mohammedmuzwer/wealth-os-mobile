/**
 * SubscriptionShelf.tsx
 * Scrollable list of subscription cards.
 *
 * Card layout:
 *   ┌─────────────────────────────────────────┐
 *   │  [●]  🎬 Netflix        ₹649.00 / mo   │
 *   │       (Next: Apr 15)    [Auto-Debit]    │
 *   └─────────────────────────────────────────┘
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { Subscription } from '../hooks/useSubscriptions';

// ─── Individual Card ──────────────────────────────────────────────────────────

interface SubCardProps {
  item: Subscription;
  onDelete: (id: string) => void;
}

const SubCard: React.FC<SubCardProps> = ({ item, onDelete }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1.0, useNativeDriver: true, speed: 50 }).start();

  const handleLongPress = () => {
    Alert.alert(
      `Remove ${item.name}?`,
      `₹${item.price}/mo will be freed from your fixed expenses.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onDelete(item.id),
        },
      ],
    );
  };

  const priceFormatted = `₹${item.price.toFixed(2)} / mo`;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        {/* Logo circle */}
        <View style={[styles.logo, { backgroundColor: item.color + '22' }]}>
          <Text style={styles.logoEmoji}>{item.emoji}</Text>
          {/* Active indicator dot */}
          <View style={[styles.activeDot, { backgroundColor: item.color }]} />
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name}>{item.emoji} {item.name}</Text>
          <Text style={styles.renewal}>Next: {item.nextRenewal}</Text>
        </View>

        {/* Pricing */}
        <View style={styles.pricing}>
          <Text style={styles.price}>{priceFormatted}</Text>
          {item.autoDebit && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Auto-Debit</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── SubscriptionShelf ────────────────────────────────────────────────────────

interface SubscriptionShelfProps {
  subscriptions: Subscription[];
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export const SubscriptionShelf: React.FC<SubscriptionShelfProps> = ({
  subscriptions,
  onDelete,
  onAdd,
}) => {
  return (
    <View style={styles.shelf}>
      {/* Shelf header */}
      <View style={styles.shelfHeader}>
        <View style={styles.shelfTitleRow}>
          <Text style={styles.shelfTitle}>Subscription Shelf</Text>
          <Text style={styles.shelfCount}>{subscriptions.length} active</Text>
        </View>
        {/* Add FAB */}
        <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Cards list */}
      <View style={styles.list}>
        {subscriptions.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.cardWrapper,
              index < subscriptions.length - 1 && styles.cardDivider,
            ]}
          >
            <SubCard item={item} onDelete={onDelete} />
          </View>
        ))}

        {subscriptions.length === 0 && (
          <Text style={styles.emptyText}>
            No subscriptions yet.{'\n'}Tap + to add one.
          </Text>
        )}
      </View>

      {/* Long-press hint */}
      {subscriptions.length > 0 && (
        <Text style={styles.hint}>Long-press any item to remove it</Text>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shelf: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  shelfHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  shelfTitleRow: {
    gap: 4,
  },
  shelfTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
  },
  shelfCount: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  addBtnText: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 26,
    marginTop: -1,
  },
  list: {
    paddingHorizontal: 16,
  },
  cardWrapper: {
    paddingVertical: 4,
  },
  cardDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 14,
  },

  // Logo circle
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  logoEmoji: {
    fontSize: 22,
  },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  // Info block
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  renewal: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // Pricing block
  pricing: {
    alignItems: 'flex-end',
    gap: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  tag: {
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.4,
  },

  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    paddingVertical: 32,
    lineHeight: 22,
  },
  hint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#D1D5DB',
    paddingVertical: 12,
  },
});
