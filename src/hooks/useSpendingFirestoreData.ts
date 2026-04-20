import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const FIRESTORE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const FIRESTORE_USER_ID = process.env.EXPO_PUBLIC_FIREBASE_USER_ID;

const getFirestoreNumber = (field: any): number => {
  if (!field) return 0;
  if (typeof field.integerValue === 'string') return Number(field.integerValue) || 0;
  if (typeof field.doubleValue === 'number') return field.doubleValue;
  return 0;
};

const getFirestoreString = (field: any): string => {
  if (!field) return '';
  if (typeof field.stringValue === 'string') return field.stringValue;
  return '';
};

const getFirestoreDate = (field: any): Date | null => {
  const raw = field?.timestampValue || field?.stringValue;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

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

const normalizeTag = (fields: any): SpendExpenseTag => {
  const raw = getFirestoreString(fields.tag).toLowerCase();
  if (raw === 'fixed' || raw === 'variable' || raw === 'system') return raw;
  if (fields.is_fixed?.booleanValue === true) return 'fixed';
  return 'variable';
};

const parseExpenseDoc = (doc: any): SpendExpense | null => {
  const fields = doc?.fields || {};
  const id = String(doc?.name || '')
    .split('/')
    .pop();
  if (!id) return null;
  const amount = Math.max(0, getFirestoreNumber(fields.amount));
  const date =
    getFirestoreDate(fields.date) ||
    getFirestoreDate(fields.timestamp) ||
    getFirestoreDate(fields.occurredAt);
  if (!date) return null;
  return {
    id,
    amount,
    category: getFirestoreString(fields.category) || 'Other',
    tag: normalizeTag(fields),
    date,
    name: getFirestoreString(fields.name) || getFirestoreString(fields.title) || 'Expense',
    icon: getFirestoreString(fields.icon),
  };
};

export type UseSpendingFirestoreResult = {
  expenses: SpendExpense[];
  activeDailyBudget: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  removeExpenseLocal: (id: string) => void;
};

export function useSpendingFirestoreData(fallbackDailyBudget: number): UseSpendingFirestoreResult {
  const [expenses, setExpenses] = useState<SpendExpense[]>([]);
  const [activeDailyBudget, setActiveDailyBudget] = useState(fallbackDailyBudget);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const savedUserId = await AsyncStorage.getItem('wos_user_id');
      const userId = FIRESTORE_USER_ID || savedUserId;
      if (!FIRESTORE_PROJECT_ID || !userId) {
        setExpenses([]);
        setActiveDailyBudget(fallbackDailyBudget);
        return;
      }
      const expensesUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/expenses`;
      const settingsUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/settings`;

      const [expRes, setRes] = await Promise.all([fetch(expensesUrl), fetch(settingsUrl)]);

      if (setRes.ok) {
        const setJson = await setRes.json();
        const fields = setJson?.fields || {};
        const remote = getFirestoreNumber(fields.activeDailyBudget);
        if (Number.isFinite(remote) && remote > 0) {
          setActiveDailyBudget(remote);
        } else {
          setActiveDailyBudget(fallbackDailyBudget);
        }
      } else {
        setActiveDailyBudget(fallbackDailyBudget);
      }

      if (!expRes.ok) {
        setExpenses([]);
        if (!expRes.ok && expRes.status !== 404) {
          setError(`Expenses ${expRes.status}`);
        }
        return;
      }

      const payload = await expRes.json();
      const docs = Array.isArray(payload?.documents) ? payload.documents : [];
      const parsed: SpendExpense[] = [];
      for (const doc of docs) {
        const row = parseExpenseDoc(doc);
        if (row) parsed.push(row);
      }
      setExpenses(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [fallbackDailyBudget]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeExpenseLocal = useCallback((id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  }, []);

  return { expenses, activeDailyBudget, loading, error, refresh, removeExpenseLocal };
}

export async function deleteSpendExpenseRemote(expenseId: string): Promise<boolean> {
  const savedUserId = await AsyncStorage.getItem('wos_user_id');
  const userId = FIRESTORE_USER_ID || savedUserId;
  if (!FIRESTORE_PROJECT_ID || !userId) return false;
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/expenses/${expenseId}`;
  const res = await fetch(url, { method: 'DELETE' }).catch(() => null);
  return !!res && res.ok;
}
