/**
 * expenseEvents.ts
 *
 * Lightweight pub/sub for expense writes.
 *
 * After any successful Firestore expense write, call emitExpenseAdded().
 * Any instance of useSpendingFirestoreData subscribes to this and triggers
 * a refresh — giving automatic, real-time sync across all screens without
 * a native Firebase SDK or polling loop.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export const expenseEvents = {
  /**
   * Register a callback that fires whenever an expense is written to Firestore.
   * Returns an unsubscribe function — call it in your useEffect cleanup.
   */
  onExpenseAdded(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  /** Fire after a successful Firestore expense write. */
  emitExpenseAdded(): void {
    listeners.forEach(fn => {
      try {
        fn();
      } catch {
        // Silently swallow listener errors so one bad subscriber can't break others.
      }
    });
  },
};
