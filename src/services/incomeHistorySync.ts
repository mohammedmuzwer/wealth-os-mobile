import { IncomeHistoryEntry } from '../store/incomeHistoryStore';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

const buildDocUrl = (docId: string) => {
  if (!projectId) return null;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/incomeHistory/${docId}`;
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
