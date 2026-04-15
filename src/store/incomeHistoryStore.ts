import { create } from 'zustand';

export type IncomeHistoryEntry = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: 'salary' | 'freelance';
  date: string;
  amount: number;
  deduction?: number;
};

type IncomeHistoryState = {
  incomeHistory: IncomeHistoryEntry[];
  addIncomeHistory: (entry: IncomeHistoryEntry) => void;
  updateIncomeHistory: (id: string, patch: Partial<IncomeHistoryEntry>) => void;
  deleteIncomeHistory: (id: string) => void;
};

export const useIncomeHistoryStore = create<IncomeHistoryState>(set => ({
  incomeHistory: [],
  addIncomeHistory: entry =>
    set(state => ({
      incomeHistory: [entry, ...state.incomeHistory],
    })),
  updateIncomeHistory: (id, patch) =>
    set(state => ({
      incomeHistory: state.incomeHistory.map(item =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),
  deleteIncomeHistory: id =>
    set(state => ({
      incomeHistory: state.incomeHistory.filter(item => item.id !== id),
    })),
}));
