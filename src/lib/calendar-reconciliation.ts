import { reconcileQuestionBlocksCalendar } from "./calendar-sync";

type ReconciliationResult = { synced: number; failed: number };
type PendingReconciliation = {
  promise: Promise<ReconciliationResult>;
  rerunRequested: boolean;
};
const pendingByUser = new Map<string, PendingReconciliation>();

export function reconcileCalendar(userId: string): Promise<ReconciliationResult> {
  const existing = pendingByUser.get(userId);
  if (existing) {
    existing.rerunRequested = true;
    return existing.promise;
  }

  const state: PendingReconciliation = {
    promise: Promise.resolve({ synced: 0, failed: 0 }),
    rerunRequested: false,
  };
  state.promise = Promise.resolve().then(async () => {
    try {
      let result = await reconcileQuestionBlocksCalendar(userId);
      // Coalesce changes received during the first round into one extra round.
      // A later focus, online or auth event can retry again; this never loops.
      if (state.rerunRequested) {
        state.rerunRequested = false;
        result = await reconcileQuestionBlocksCalendar(userId);
      }
      return result;
    } finally {
      if (pendingByUser.get(userId) === state) pendingByUser.delete(userId);
    }
  });
  pendingByUser.set(userId, state);
  return state.promise;
}
