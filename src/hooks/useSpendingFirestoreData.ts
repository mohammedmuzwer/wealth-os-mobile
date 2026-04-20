/**
 * useSpendingFirestoreData.ts
 *
 * Reads expenses from local AsyncStorage (wos_expenses key).
 * All exports and types are identical to the original Firestore version
 * so no import changes are needed in SpendingScreen, SpendingScrollBody,
 * or HomeScreen.
 */

import { useCallback, useEffect, useState } from 'react';
import { expenseEvents } from '../events/expenseEvents';
import { getExpenses, deleteExpense } from '../utils/localStorage';

export type SpendExpenseTag = 'fixed' | 'variable' | 'system';

export type SpendExpense = {
  id: string;
  amount: number;
  category: string;
  tag: SpendExpenseTag;
  date: Date;
  name: string;
  icon: string;
};

export type UseSpendingFirestoreResult = {
  expenses: SpendExpense[];
  activeDailyBudget: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  removeExpenseLocal: (id: string) => void;
};

const toSpendExpense = (raw: {
  id: string;
  amount: number;
  category: string;
  tag: string;
  name: string;
  icon: string;
  date: string;
}): SpendExpense | null => {
  const date = new Date(raw.date);
  if (Number.isNaN(date.getTime())) return null;
  const tag = raw.tag === 'fixed' || raw.tag === 'system' ? raw.tag : 'variable';
  return {
    id: raw.id,
    amount: raw.amount,
    category: raw.category,
    tag,
    date,
    name: raw.name,
    icon: raw.icon,
  };
};

export function useSpendingFirestoreData(fallbackDailyBudget: number): UseSpendingFirestoreResult {
  const [expenses, setExpenses] = useState<SpendExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await getExpenses();
      const parsed = raw
        .map(toSpendExpense)
        .filter((e): e is SpendExpense => e !== null);
      setExpenses(parsed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = expenseEvents?.onExpenseAdded?.(() => {
      refresh();
    });
    return () => unsub?.();
  }, []);

  const removeExpenseLocal = useCallback((id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  }, []);

  return {
    expenses,
    activeDailyBudget: fallbackDailyBudget,
    loading,
    error: null,
    refresh,
    removeExpenseLocal,
  };
}

export async function deleteSpendExpenseRemote(expenseId: string): Promise<boolean> {
  try {
    await deleteExpense(expenseId);
    return true;
  } catch {
    return false;
  }
}
