/**
 * DashboardScreen.tsx
 * Main financial dashboard for Wealth OS.
 *
 * Sections:
 *  - Header with wealth score tier
 *  - WealthRings (Shield / Track / Build)
 *  - Fixed vs Variable spending breakdown
 *  - Insights list
 *  - Recent expenses with delete
 *  - Quick-add expense FAB
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  StatusBar,
} from 'react-native';
import { WealthRings } from '../components/WealthRings';
import { ExpenseInputSheet } from '../components/ExpenseInputSheet';
import { useFinancials } from '../hooks/useFinancials';
import { EXPENSE_RULES, ExpenseCategory, ScoreTier, fmt } from '../utils/finance';
import {
  SHIELD_RED, TRACK_BLUE, BUILD_GREEN,
  VAULT_GOLD, AMBER, PURPLE,
  RING_SIZE,
} from '../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardScreenProps {
  onLock: () => void;
}


// ─── DashboardScreen ──────────────────────────────────────────────────────────

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onLock }) => {
  const {
    expenses,
    summary,
    fixedVsVariable,
    insights,
    addExpense,
    deleteExpense,
  } = useFinancials();

  const [fabVisible, setFabVisible] = useState(false);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      'Delete Expense',
      'Remove this expense from your log?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(id) },
      ],
    );
  }, [deleteExpense]);

  const TIER_COLOR: Record<ScoreTier, string> = {
    'ELITE':   VAULT_GOLD,
    'STRONG':  BUILD_GREEN,
    'GROWING': TRACK_BLUE,
    'STABLE':  '#8888AA',
    'AT RISK': SHIELD_RED,
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>Wealth OS</Text>
          <Text style={[styles.tierBadge, { color: TIER_COLOR[summary.scoreTier] }]}>
            {summary.scoreTier}
          </Text>
        </View>
        <TouchableOpacity style={styles.lockBtn} onPress={onLock}>
          <Text style={styles.lockBtnText}>🔒 Lock</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* Rings card */}
        <View style={styles.card}>
          <WealthRings
            shieldPct={summary.shieldPct}
            trackPct={summary.trackPct}
            buildPct={summary.buildPct}
            wealthScore={summary.wealthScore}
            size={RING_SIZE}
          />
          <View style={styles.ringLegendDetail}>
            <RingLegendRow color={SHIELD_RED}   label="Shield"  desc="Daily vs 10% income limit" pct={summary.shieldPct} />
            <RingLegendRow color={TRACK_BLUE}   label="Track"   desc="Expense ratio control"      pct={summary.trackPct}  />
            <RingLegendRow color={BUILD_GREEN}  label="Build"   desc="Monthly savings rate"        pct={summary.buildPct}  />
          </View>
        </View>

        {/* Fixed vs Variable */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spending Breakdown</Text>
          <View style={styles.fvRow}>
            <FVBlock label="Fixed" amount={fixedVsVariable.fixed} pct={fixedVsVariable.fixedPct} color={TRACK_BLUE} />
            <View style={styles.fvDivider} />
            <FVBlock label="Variable" amount={fixedVsVariable.variable} pct={fixedVsVariable.variablePct} color={AMBER} />
          </View>
          {/* Bar */}
          <View style={styles.fvBar}>
            <View style={[styles.fvBarFixed,    { flex: fixedVsVariable.fixedPct    || 1 }]} />
            <View style={[styles.fvBarVariable, { flex: fixedVsVariable.variablePct || 1 }]} />
          </View>
          <View style={styles.categoryGrid}>
            {(Object.entries(fixedVsVariable.breakdown) as [ExpenseCategory, number][])
              .filter(([, amt]) => amt > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amt]) => (
                <View key={cat} style={styles.categoryChip}>
                  <Text style={styles.categoryIcon}>{EXPENSE_RULES[cat].icon}</Text>
                  <Text style={styles.categoryAmt}>{fmt(amt)}</Text>
                </View>
              ))}
          </View>
        </View>

        {/* Insights */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Insights</Text>
          {insights.map((ins, i) => (
            <View key={i} style={[styles.insightRow, styles[`insight_${ins.status}`]]}>
              <Text style={styles.insightIcon}>{ins.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightCat}>{ins.category}</Text>
                <Text style={styles.insightMsg}>{ins.message}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Recent Expenses */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Expenses</Text>
          {expenses.length === 0 ? (
            <Text style={styles.emptyText}>No expenses logged yet.</Text>
          ) : (
            expenses.slice(0, 15).map((exp) => (
              <View key={exp.id} style={styles.expenseRow}>
                <Text style={styles.expenseIcon}>{EXPENSE_RULES[exp.category]?.icon ?? '📦'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseName}>{EXPENSE_RULES[exp.category]?.name ?? exp.category}</Text>
                  {exp.note && <Text style={styles.expenseNote}>{exp.note}</Text>}
                </View>
                <Text style={styles.expenseAmt}>{fmt(exp.amount)}</Text>
                <TouchableOpacity onPress={() => handleDelete(exp.id)} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setFabVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <ExpenseInputSheet
        visible={fabVisible}
        onClose={() => setFabVisible(false)}
        onSubmit={addExpense}
      />
    </SafeAreaView>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const RingLegendRow: React.FC<{
  color: string; label: string; desc: string; pct: number;
}> = ({ color, label, desc, pct }) => (
  <View style={styles.legendDetailRow}>
    <View style={[styles.legendDetailDot, { backgroundColor: color }]} />
    <View style={{ flex: 1 }}>
      <Text style={styles.legendDetailLabel}>{label}</Text>
      <Text style={styles.legendDetailDesc}>{desc}</Text>
    </View>
    <Text style={[styles.legendDetailPct, { color }]}>{pct}%</Text>
  </View>
);

const FVBlock: React.FC<{
  label: string; amount: number; pct: number; color: string;
}> = ({ label, amount, pct, color }) => (
  <View style={styles.fvBlock}>
    <Text style={[styles.fvLabel, { color }]}>{label}</Text>
    <Text style={styles.fvAmount}>{fmt(amount)}</Text>
    <Text style={styles.fvPct}>{pct}%</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  tierBadge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  lockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  lockBtnText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  scroll: { flex: 1 },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    alignSelf: 'flex-start',
    marginBottom: 12,
  },

  // Ring legend detail
  ringLegendDetail: {
    width: '100%',
    marginTop: 16,
    gap: 10,
  },
  legendDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDetailDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendDetailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  legendDetailDesc: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  legendDetailPct: {
    fontSize: 15,
    fontWeight: '800',
  },

  // Fixed vs Variable
  fvRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 12,
  },
  fvBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  fvDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
  },
  fvLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fvAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  fvPct: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  fvBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
    marginBottom: 12,
  },
  fvBarFixed:    { backgroundColor: TRACK_BLUE },
  fvBarVariable: { backgroundColor: AMBER },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryIcon: { fontSize: 13 },
  categoryAmt:  { fontSize: 12, fontWeight: '600', color: '#374151' },

  // Insights
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  insight_success: { backgroundColor: '#F0FDF4' },
  insight_warn:    { backgroundColor: '#FFFBEB' },
  insight_danger:  { backgroundColor: '#FEF2F2' },
  insightIcon: { fontSize: 18 },
  insightCat: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  insightMsg: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },

  // Expenses
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  expenseIcon: { fontSize: 18 },
  expenseName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  expenseNote: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  expenseAmt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 32,
  },
});

