import { IncomeHistoryEntry } from '../store/incomeHistoryStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const userIdFromEnv = process.env.EXPO_PUBLIC_FIREBASE_USER_ID;

const buildDocUrl = (docId: string) => {
  if (!projectId) return null;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/incomeHistory/${docId}`;
};

const buildSettingsDocUrl = async () => {
  if (!projectId) return null;
  const storedUserId = await AsyncStorage.getItem('wos_user_id');
  const userId = userIdFromEnv || storedUserId;
  if (!userId) return null;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/settings`;
};

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

export const createIncomeHistoryFirestoreRecord = async (entry: IncomeHistoryEntry) => {
  const url = buildDocUrl(entry.id);
  if (!url) return;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        sourceId: { stringValue: entry.sourceId },
        sourceName: { stringValue: entry.sourceName },
        sourceType: { stringValue: entry.sourceType },
        date: { stringValue: entry.date },
        amount: { integerValue: Math.round(entry.amount).toString() },
        deduction: { integerValue: Math.round(entry.deduction ?? 0).toString() },
      },
    }),
  }).catch(() => {});
};

export const updateIncomeHistoryFirestoreRecord = async (
  id: string,
  patch: Partial<IncomeHistoryEntry>,
) => {
  const url = buildDocUrl(id);
  if (!url) return;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        ...(patch.sourceId ? { sourceId: { stringValue: patch.sourceId } } : {}),
        ...(patch.sourceName ? { sourceName: { stringValue: patch.sourceName } } : {}),
        ...(patch.sourceType ? { sourceType: { stringValue: patch.sourceType } } : {}),
        ...(patch.date ? { date: { stringValue: patch.date } } : {}),
        ...(typeof patch.amount === 'number'
          ? { amount: { integerValue: Math.round(patch.amount).toString() } }
          : {}),
        ...(typeof patch.deduction === 'number'
          ? { deduction: { integerValue: Math.round(patch.deduction).toString() } }
          : {}),
      },
    }),
  }).catch(() => {});
};

export const deleteIncomeHistoryFirestoreRecord = async (id: string) => {
  const url = buildDocUrl(id);
  if (!url) return;
  await fetch(url, { method: 'DELETE' }).catch(() => {});
};

export const updateUserSettingsFirestoreRecord = async (patch: UserSettingsPatch) => {
  const url = await buildSettingsDocUrl();
  if (!url) return;

  const fields: Record<string, any> = {};
  if (typeof patch.activeDailyBudget === 'number') {
    fields.activeDailyBudget = { doubleValue: patch.activeDailyBudget };
  }
  if (typeof patch.salaryConfirmed === 'boolean') {
    fields.salaryConfirmed = { booleanValue: patch.salaryConfirmed };
  }
  if (patch.incomeConfirmedAt instanceof Date) {
    fields.incomeConfirmedAt = { timestampValue: patch.incomeConfirmedAt.toISOString() };
  }
  if (typeof patch.dailySpent === 'number') {
    fields.dailySpent = { doubleValue: patch.dailySpent };
  }
  if (typeof patch.trackLevel === 'number') {
    fields.trackLevel = { integerValue: Math.max(1, Math.min(10, Math.round(patch.trackLevel))).toString() };
  }
  if (typeof patch.pocketSplitPct === 'number') {
    fields.pocketSplitPct = { integerValue: Math.max(10, Math.min(90, Math.round(patch.pocketSplitPct))).toString() };
  }
  if (typeof patch.allocationPct === 'number') {
    fields.allocationPct = { integerValue: Math.max(1, Math.min(50, Math.round(patch.allocationPct))).toString() };
  }
  if (typeof patch.monthlyPool === 'number') {
    fields.monthlyPool = { doubleValue: patch.monthlyPool };
  }

  if (!Object.keys(fields).length) return;

  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  }).catch(() => {});
};
