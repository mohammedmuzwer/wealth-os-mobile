/**
 * localStorage.ts
 *
 * All persistent app data via AsyncStorage — no network calls.
 * Every Firestore-dependent screen reads/writes through these helpers.
 *
 * Keys:
 *   wos_expenses       — expense log (array)
 *   wos_income         — income settings (object)
 *   wos_settings       — app settings (object)
 *   wos_income_sources — income source documents (array)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LocalExpense = {
  id: string;
  amount: number;
  category: string;
  tag: 'fixed' | 'variable' | 'system';
  name: string;
  icon: string;
  date: string; // ISO string
};

export type IncomeData = {
  confirmedIncome: number;
  allocationPct: number;
  activeDailyBudget: number;
  monthlyPool: number;
  salaryConfirmed: boolean;
};

export type LocalSettings = {
  pocketSplitPct: number;
  pocketMode: 'auto' | 'manual';
  trackLevel: number;
  salary: number;
};

export type LocalIncomeSource = {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  isRecurring: boolean;
  frequency: string;
  kind: 'salary' | 'freelance';
  confirmed: boolean;
  expectedDate: string | null; // ISO string or null
  recurrenceType: string;
};

// ── Storage keys ──────────────────────────────────────────────────────────────

const EXPENSES_KEY = 'wos_expenses';
const INCOME_KEY = 'wos_income';
const SETTINGS_KEY = 'wos_settings';
const INCOME_SOURCES_KEY = 'wos_income_sources';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_INCOME: IncomeData = {
  confirmedIncome: 0,
  allocationPct: 10,
  activeDailyBudget: 0,
  monthlyPool: 0,
  salaryConfirmed: false,
};

const DEFAULT_SETTINGS: LocalSettings = {
  pocketSplitPct: 50,
  pocketMode: 'auto',
  trackLevel: 4,
  salary: 0,
};

// ── Expenses ──────────────────────────────────────────────────────────────────

export const getExpenses = async (): Promise<LocalExpense[]> => {
  try {
    const raw = await AsyncStorage.getItem(EXPENSES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalExpense[];
  } catch {
    return [];
  }
};

export const saveExpense = async (expense: LocalExpense): Promise<void> => {
  try {
    const existing = await getExpenses();
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify([...existing, expense]));
  } catch {}
};

export const deleteExpense = async (id: string): Promise<void> => {
  try {
    const existing = await getExpenses();
    await AsyncStorage.setItem(
      EXPENSES_KEY,
      JSON.stringify(existing.filter(e => e.id !== id)),
    );
  } catch {}
};

// ── Income ────────────────────────────────────────────────────────────────────

export const getIncome = async (): Promise<IncomeData> => {
  try {
    const raw = await AsyncStorage.getItem(INCOME_KEY);
    if (!raw) return { ...DEFAULT_INCOME };
    return { ...DEFAULT_INCOME, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_INCOME };
  }
};

export const saveIncome = async (data: Partial<IncomeData>): Promise<void> => {
  try {
    const existing = await getIncome();
    await AsyncStorage.setItem(INCOME_KEY, JSON.stringify({ ...existing, ...data }));
  } catch {}
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const getSettings = async (): Promise<LocalSettings> => {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = async (data: Partial<LocalSettings>): Promise<void> => {
  try {
    const existing = await getSettings();
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...data }));
  } catch {}
};

// ── Income Sources ────────────────────────────────────────────────────────────

export const getIncomeSources = async (): Promise<LocalIncomeSource[]> => {
  try {
    const raw = await AsyncStorage.getItem(INCOME_SOURCES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalIncomeSource[];
  } catch {
    return [];
  }
};

export const saveIncomeSources = async (sources: LocalIncomeSource[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(INCOME_SOURCES_KEY, JSON.stringify(sources));
  } catch {}
};

export const upsertIncomeSource = async (source: LocalIncomeSource): Promise<void> => {
  try {
    const existing = await getIncomeSources();
    const idx = existing.findIndex(s => s.id === source.id);
    if (idx >= 0) {
      existing[idx] = source;
    } else {
      existing.unshift(source);
    }
    await AsyncStorage.setItem(INCOME_SOURCES_KEY, JSON.stringify(existing));
  } catch {}
};

export const deleteIncomeSource = async (id: string): Promise<void> => {
  try {
    const existing = await getIncomeSources();
    await AsyncStorage.setItem(
      INCOME_SOURCES_KEY,
      JSON.stringify(existing.filter(s => s.id !== id)),
    );
  } catch {}
};
