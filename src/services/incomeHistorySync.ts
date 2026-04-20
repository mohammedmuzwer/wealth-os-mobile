/**
 * incomeHistorySync.ts
 *
 * All exports preserved — callers (HomeScreen, IncomeEngineScreen) need
 * zero import changes. Firestore is replaced by localStorage helpers.
 */

import { IncomeHistoryEntry } from '../store/incomeHistoryStore';
import { saveIncome, saveSettings } from '../utils/localStorage';

type UserSettingsPatch = {
  activeDailyBudget?: number;
  salaryConfirmed?: boolean;
  incomeConfirmedAt?: Date;
  dailySpent?: number;
  trackLevel?: number;
  pocketSplitPct?: number;
  allocationPct?: number;
  monthlyPool?: number;
};

// Income history records are already persisted by useIncomeHistoryStore
// via its own AsyncStorage key — these are intentional no-ops.
export const createIncomeHistoryFirestoreRecord = async (
  _entry: IncomeHistoryEntry,
): Promise<void> => {};

export const updateIncomeHistoryFirestoreRecord = async (
  _id: string,
  _patch: Partial<IncomeHistoryEntry>,
): Promise<void> => {};

export const deleteIncomeHistoryFirestoreRecord = async (
  _id: string,
): Promise<void> => {};

/**
 * Persists settings/income fields to AsyncStorage.
 * Maps to the appropriate localStorage key based on field type.
 */
export const updateUserSettingsFirestoreRecord = async (
  patch: UserSettingsPatch,
): Promise<void> => {
  const incomeUpdate: Record<string, number | boolean> = {};
  const settingsUpdate: Record<string, number | string> = {};

  if (typeof patch.activeDailyBudget === 'number') {
    incomeUpdate.activeDailyBudget = patch.activeDailyBudget;
  }
  if (typeof patch.salaryConfirmed === 'boolean') {
    incomeUpdate.salaryConfirmed = patch.salaryConfirmed;
  }
  if (typeof patch.monthlyPool === 'number') {
    incomeUpdate.monthlyPool = patch.monthlyPool;
  }
  if (typeof patch.allocationPct === 'number') {
    incomeUpdate.allocationPct = Math.max(1, Math.min(50, Math.round(patch.allocationPct)));
  }

  if (typeof patch.pocketSplitPct === 'number') {
    settingsUpdate.pocketSplitPct = Math.max(10, Math.min(90, Math.round(patch.pocketSplitPct)));
  }
  if (typeof patch.trackLevel === 'number') {
    settingsUpdate.trackLevel = Math.max(1, Math.min(10, Math.round(patch.trackLevel)));
  }

  await Promise.all([
    Object.keys(incomeUpdate).length ? saveIncome(incomeUpdate as any) : Promise.resolve(),
    Object.keys(settingsUpdate).length ? saveSettings(settingsUpdate as any) : Promise.resolve(),
  ]);
};
