import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Expense } from '../utils/finance';

type WealthContextValue = {
  totalIncome: number;
  fixedObligations: number;
  dailySpent: number;
  daysInMonth: number;
  customDailyLimit: number | null;
  monthlyAllocationPercent: number;
  baseDailyBudget: number;
  criticalDailyLimit: number;
  todayDynamicBudget: number;
  activeDailyBudget: number;
  vaultSweep: number;
  shieldPercentage: number;
  ovsScore: number;
  setTotalIncome: React.Dispatch<React.SetStateAction<number>>;
  setDailySpent: React.Dispatch<React.SetStateAction<number>>;
  setCustomDailyLimit: React.Dispatch<React.SetStateAction<number | null>>;
  setMonthlyAllocationPercent: React.Dispatch<React.SetStateAction<number>>;
};

const WealthContext = createContext<WealthContextValue | undefined>(undefined);
const EXPENSE_LOG_KEY = 'wos_expense_log';

export const WealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [totalIncome, setTotalIncome] = useState(74000);
  const [dailySpent, setDailySpent] = useState(0);
  const [daysInMonth] = useState(30);
  const [customDailyLimit, setCustomDailyLimit] = useState<number | null>(null);
  const [monthlyAllocationPercent, setMonthlyAllocationPercent] = useState(10);
  const [totalActuallySpentThisMonth, setTotalActuallySpentThisMonth] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(EXPENSE_LOG_KEY)
      .then(raw => {
        if (!raw) {
          setTotalActuallySpentThisMonth(0);
          return;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setTotalActuallySpentThisMonth(0);
          return;
        }
        const now = new Date();
        const monthSpent = (parsed as Expense[])
          .filter(item => {
            const date = new Date(item.date);
            return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
          })
          .reduce((sum, item) => sum + item.amount, 0);
        setTotalActuallySpentThisMonth(monthSpent);
      })
      .catch(() => {
        setTotalActuallySpentThisMonth(0);
      });
  }, [dailySpent]);

  const fixedObligations = totalIncome * (1 - monthlyAllocationPercent / 100);
  const baseDailyBudget = (totalIncome * (monthlyAllocationPercent / 100)) / daysInMonth;

  // The survival floor is 40% of the base budget.
  const criticalDailyLimit = baseDailyBudget * 0.4;

  const currentDay = new Date().getDate();
  const totalPotentialSpendSoFar = baseDailyBudget * Math.max(0, currentDay - 1);
  const savedSurplus = totalPotentialSpendSoFar - totalActuallySpentThisMonth;
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);
  const todayDynamicBudget = Math.max(
    criticalDailyLimit,
    baseDailyBudget + savedSurplus / daysRemaining,
  );

  const activeDailyBudget = customDailyLimit !== null ? customDailyLimit : baseDailyBudget;
  const vaultSweep = Math.max(0, activeDailyBudget - dailySpent);
  const shieldPercentage =
    activeDailyBudget > 0
      ? Math.max(0, ((activeDailyBudget - dailySpent) / activeDailyBudget) * 100)
      : 0;
  const ovsScore = Math.round(Math.max(0, Math.min(shieldPercentage, 100)));

  const value = useMemo(
    () => ({
      totalIncome,
      fixedObligations,
      dailySpent,
      daysInMonth,
      customDailyLimit,
      monthlyAllocationPercent,
      baseDailyBudget,
      criticalDailyLimit,
      todayDynamicBudget,
      activeDailyBudget,
      vaultSweep,
      shieldPercentage,
      ovsScore,
      setTotalIncome,
      setDailySpent,
      setCustomDailyLimit,
      setMonthlyAllocationPercent,
    }),
    [
      totalIncome,
      fixedObligations,
      dailySpent,
      daysInMonth,
      customDailyLimit,
      monthlyAllocationPercent,
      baseDailyBudget,
      criticalDailyLimit,
      todayDynamicBudget,
      activeDailyBudget,
      vaultSweep,
      shieldPercentage,
      ovsScore,
      setMonthlyAllocationPercent,
    ],
  );

  return <WealthContext.Provider value={value}>{children}</WealthContext.Provider>;
};

export const useWealth = () => {
  const ctx = useContext(WealthContext);
  if (!ctx) {
    throw new Error('useWealth must be used inside WealthProvider');
  }
  return ctx;
};
