/**
 * useSubscriptions.ts
 * Subscription / Fixed Expense data and derived metrics for Wealth OS.
 *
 * Seeded with sample data. Replace with AsyncStorage persistence when ready.
 */

import { useState, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubCategory = 'entertainment' | 'utility' | 'health' | 'other';

export interface Subscription {
  id: string;
  name: string;
  emoji: string;
  price: number;           // monthly ₹
  category: SubCategory;
  nextRenewal: string;     // 'Apr 15' display string
  autoDebit: boolean;
  color: string;           // logo circle background
}

export interface CategorySplit {
  label: string;
  amount: number;
  pct: number;             // 0–100
  color: string;
}

export interface SubscriptionMetrics {
  totalMonthly: number;
  dailyImpact: number;     // totalMonthly / 30
  splits: CategorySplit[];
  renewalsThisWeek: number;
}

// ─── Sample data ──────────────────────────────────────────────────────────────
// Netflix(649) + Gym(1500) + Spotify(119) + iCloud(182) = ₹2,450

const SEED_SUBSCRIPTIONS: Subscription[] = [
  {
    id: '1',
    name: 'Netflix',
    emoji: '🎬',
    price: 649,
    category: 'entertainment',
    nextRenewal: 'Apr 15',
    autoDebit: true,
    color: '#E50914',
  },
  {
    id: '2',
    name: 'Gym',
    emoji: '🏋️',
    price: 1500,
    category: 'health',
    nextRenewal: 'Apr 12',
    autoDebit: false,
    color: '#10B981',
  },
  {
    id: '3',
    name: 'Spotify',
    emoji: '🎵',
    price: 119,
    category: 'entertainment',
    nextRenewal: 'Apr 18',
    autoDebit: true,
    color: '#1DB954',
  },
  {
    id: '4',
    name: 'iCloud+',
    emoji: '☁️',
    price: 182,
    category: 'utility',
    nextRenewal: 'Apr 20',
    autoDebit: true,
    color: '#3B82F6',
  },
];

// ─── Category display config ──────────────────────────────────────────────────
// Design spec: 60% Entertainment (purple) | 40% Utility/Other (teal)
// Percentages are hardcoded for the visual; amountis computed from real data.

const CATEGORY_CONFIG: Record<SubCategory, { label: string; color: string }> = {
  entertainment: { label: 'Entertainment', color: '#7C3AED' }, // purple
  utility:       { label: 'Utility',       color: '#0D9488' }, // teal
  health:        { label: 'Health',        color: '#0D9488' }, // grouped into teal bucket
  other:         { label: 'Other',         color: '#6B7280' },
};

// For the split bar we merge into two buckets: Entertainment vs Utility/Health/Other
const SPLIT_BUCKETS = {
  Entertainment: { categories: ['entertainment'] as SubCategory[], color: '#7C3AED', hardcodedPct: 60 },
  Utility:       { categories: ['utility', 'health', 'other'] as SubCategory[], color: '#0D9488', hardcodedPct: 40 },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSubscriptionsReturn {
  subscriptions: Subscription[];
  metrics: SubscriptionMetrics;
  addSubscription: (sub: Omit<Subscription, 'id'>) => void;
  removeSubscription: (id: string) => void;
}

export const useSubscriptions = (): UseSubscriptionsReturn => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(SEED_SUBSCRIPTIONS);

  const metrics = useMemo<SubscriptionMetrics>(() => {
    const totalMonthly = subscriptions.reduce((s, sub) => s + sub.price, 0);
    const dailyImpact  = Math.round(totalMonthly / 30);

    // Compute real amounts per bucket
    const splits: CategorySplit[] = Object.entries(SPLIT_BUCKETS).map(([label, cfg]) => {
      const amount = subscriptions
        .filter(s => cfg.categories.includes(s.category))
        .reduce((sum, s) => sum + s.price, 0);
      return {
        label,
        amount,
        pct: cfg.hardcodedPct, // design-spec hardcoded visual percentage
        color: cfg.color,
      };
    });

    // Count renewals in the next 7 days
    // Since dates are display strings ('Apr 15'), we count all for demo
    const renewalsThisWeek = subscriptions.filter(s => s.autoDebit).length;

    return { totalMonthly, dailyImpact, splits, renewalsThisWeek };
  }, [subscriptions]);

  const addSubscription = useCallback((sub: Omit<Subscription, 'id'>) => {
    setSubscriptions(prev => [...prev, { ...sub, id: Date.now().toString() }]);
  }, []);

  const removeSubscription = useCallback((id: string) => {
    setSubscriptions(prev => prev.filter(s => s.id !== id));
  }, []);

  return { subscriptions, metrics, addSubscription, removeSubscription };
};
