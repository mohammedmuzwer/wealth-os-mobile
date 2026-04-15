/**
 * useFinancials.ts
 * Financial data hook for Wealth OS.
 *
 * Manages:
 *  - Expense log (add, delete, query)
 *  - Fixed vs Variable breakdown
 *  - Ring metric calculation
 *  - Full financial summary
 *  - Spending warnings (cooldown, weekly limits)
 *  - Persistence via AsyncStorage
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuid } from 'uuid'; // npm install uuid @types/uuid
import {
  Expense,
  ExpenseCategory,
  EXPENSE_RULES,
  FinancialInput,
  FinancialSummary,
  FixedVsVariableResult,
  Insight,
  calculateFinancials,
  splitFixedVariable,
  getSpendingWarnings,
  generateInsights,
  isToday,
} from '../utils/finance';

// ─── Storage key ──────────────────────────────────────────────────────────────

const EXPENSE_LOG_KEY = 'wos_expense_log';
const FINANCIALS_KEY  = 'wos_financials';

// ─── Default financial baseline ───────────────────────────────────────────────

const DEFAULT_INPUT: FinancialInput = {
  income:      0,
  expenses:    60_000,
  savings:     0,
  investments: 1_465_000,
  loans:       600_000,
  insurance:   4_300,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseFinancialsReturn {
  expenses: Expense[];
  summary: FinancialSummary;
  fixedVsVariable: FixedVsVariableResult;
  insights: Insight[];
  /** Warnings for a given category before logging an expense. */
  getWarnings: (category: ExpenseCategory) => string[];
  addExpense: (category: ExpenseCategory, amount: number, note?: string, is_fixed?: boolean) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  /** Update the base financial inputs (income, investments, etc.). */
  updateFinancialInput: (input: Partial<FinancialInput>) => Promise<void>;
  loading: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useFinancials = (): UseFinancialsReturn => {
  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [input, setInput]             = useState<FinancialInput>(DEFAULT_INPUT);
  const [loading, setLoading]         = useState(true);

  // ── Bootstrap from AsyncStorage ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [rawLog, rawInput] = await Promise.all([
          AsyncStorage.getItem(EXPENSE_LOG_KEY),
          AsyncStorage.getItem(FINANCIALS_KEY),
        ]);
        if (rawLog)   setExpenses(JSON.parse(rawLog));
        if (rawInput) setInput(prev => ({ ...prev, ...JSON.parse(rawInput) }));
      } catch {
        // Silently start with defaults if storage is unavailable.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Persist expenses whenever they change ─────────────────────────────────
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(EXPENSE_LOG_KEY, JSON.stringify(expenses)).catch(() => {});
    }
  }, [expenses, loading]);

  // ── Add ───────────────────────────────────────────────────────────────────
  const addExpense = useCallback(
    async (category: ExpenseCategory, amount: number, note?: string, is_fixed?: boolean) => {
      const newExpense: Expense = {
        id:       uuid(),
        category,
        amount,
        note,
        date:     new Date().toISOString(),
        // PRD: is_fixed defaults to category rule; caller can override
        is_fixed: is_fixed !== undefined ? is_fixed : EXPENSE_RULES[category].type === 'fixed',
      };
      setExpenses(prev => [newExpense, ...prev]);
    },
    [],
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteExpense = useCallback(async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  }, []);

  // ── Update financial inputs ────────────────────────────────────────────────
  const updateFinancialInput = useCallback(
    async (patch: Partial<FinancialInput>) => {
      setInput(prev => {
        const next = { ...prev, ...patch };
        AsyncStorage.setItem(FINANCIALS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  // ── Derived values (computed each render, cheap) ──────────────────────────

  const todayExpenses = expenses.filter(e => isToday(e.date));
  // PRD: Fixed expenses NEVER count against the Shield ring daily budget.
  const dailyVariableSpend = todayExpenses
    .filter(e => !(e.is_fixed ?? EXPENSE_RULES[e.category]?.type === 'fixed'))
    .reduce((s, e) => s + e.amount, 0);

  // Merge daily variable spend into expenses total for current-month approximation
  const effectiveInput: FinancialInput = {
    ...input,
    expenses: Math.max(input.expenses, dailyVariableSpend),
  };

  const summary         = calculateFinancials(effectiveInput, dailyVariableSpend);
  const fixedVsVariable = splitFixedVariable(expenses);
  const insights        = generateInsights(summary);

  const getWarnings = useCallback(
    (category: ExpenseCategory) => getSpendingWarnings(category, expenses),
    [expenses],
  );

  return {
    expenses,
    summary,
    fixedVsVariable,
    insights,
    getWarnings,
    addExpense,
    deleteExpense,
    updateFinancialInput,
    loading,
  };
};
