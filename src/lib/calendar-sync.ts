import type { Database, QuestionBlock } from "./database.types";
import {
  calendarSyncClearedPatch,
  calendarSyncDisabledPatch,
  calendarSyncFailurePatch,
  calendarSyncPatchFromResult,
  stableCalendarEventId,
} from "./calendar";
import {
  createOrUpdateCalendarEventWithAuth,
  deleteCalendarEventWithAuth,
} from "./calendar-auth";
import {
  calendarEventDescription,
  calendarFingerprint,
  needsCalendarReconciliation,
} from "./calendar-sync-state";
import { supabase } from "./supabase";

type SyncOutcome = { ok: true } | { ok: false; message: string };

const syncQueues = new Map<string, Promise<SyncOutcome>>();

export function syncQuestionBlockCalendar({ blockId, userId }: { blockId: string; userId: string }) {
  const key = `${userId}:${blockId}`;
  const previous = syncQueues.get(key) ?? Promise.resolve({ ok: true } as SyncOutcome);
  const current = previous
    .catch(() => ({ ok: false, message: "Falha anterior de sincronização." } as SyncOutcome))
    .then(() => performBlockSync({ blockId, userId }))
    .catch(cause => ({
      ok: false,
      message: cause instanceof Error ? cause.message : "Falha inesperada ao sincronizar o Google Calendar.",
    }));
  syncQueues.set(key, current);
  void current.finally(() => {
    if (syncQueues.get(key) === current) syncQueues.delete(key);
  });
  return current;
}

async function performBlockSync({ blockId, userId }: { blockId: string; userId: string }): Promise<SyncOutcome> {
  const { data: block, error } = await supabase
    .from("question_blocks")
    .select("*")
    .eq("id", blockId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, message: "Não foi possível ler o bloco para sincronizar o Calendar." };
  if (!block) return { ok: true };

  const fingerprint = calendarFingerprint(block);
  let patch: Database["public"]["Tables"]["question_blocks"]["Update"];
  let outcome: SyncOutcome = { ok: true };

  if (!block.calendar_sync_enabled) {
    if (block.calendar_event_id) {
      const result = await deleteCalendarEventWithAuth(block.calendar_event_id);
      if (!result.ok) {
        patch = { ...calendarSyncFailurePatch(result.message), calendar_sync_enabled: false };
        outcome = { ok: false, message: result.message };
      } else {
        patch = calendarSyncDisabledPatch();
      }
    } else {
      patch = calendarSyncDisabledPatch();
    }
  } else if (!block.planned_review_date) {
    if (block.calendar_event_id) {
      const result = await deleteCalendarEventWithAuth(block.calendar_event_id);
      if (!result.ok) {
        patch = calendarSyncFailurePatch(result.message);
        outcome = { ok: false, message: result.message };
      } else {
        patch = calendarSyncClearedPatch(fingerprint);
      }
    } else {
      patch = calendarSyncClearedPatch(fingerprint);
    }
  } else {
    const result = await createOrUpdateCalendarEventWithAuth({
      eventId: block.calendar_event_id,
      stableEventId: stableCalendarEventId(block.id),
      blockId: block.id,
      summary: block.title,
      description: calendarEventDescription(block),
      date: block.planned_review_date,
    });
    patch = result.ok
      ? { ...calendarSyncPatchFromResult(result), calendar_sync_fingerprint: fingerprint }
      : calendarSyncPatchFromResult(result);
    if (!result.ok) outcome = { ok: false, message: result.message };
  }

  const { error: patchError } = await supabase
    .from("question_blocks")
    .update(patch)
    .eq("id", blockId)
    .eq("user_id", userId);
  if (patchError) return { ok: false, message: "O Google Calendar foi atualizado, mas o estado de sincronização não foi salvo." };
  return outcome;
}

export async function updateQuestionBlockAndSync({
  blockId,
  userId,
  changes,
}: {
  blockId: string;
  userId: string;
  changes: Partial<QuestionBlock>;
}) {
  const { data, error } = await supabase
    .from("question_blocks")
    .update(changes)
    .eq("id", blockId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error || !data) throw new Error("Não foi possível atualizar o bloco de estudo.");

  const outcome = await syncQuestionBlockCalendar({ blockId, userId });
  return { block: data, calendar: outcome };
}

export async function reconcileQuestionBlocksCalendar(userId: string) {
  const { data: blocks, error } = await supabase
    .from("question_blocks")
    .select("*")
    .eq("user_id", userId);
  if (error) return { synced: 0, failed: 0 };

  const pending = (blocks ?? []).filter(needsCalendarReconciliation);
  const results = await Promise.all(pending.map(block => syncQuestionBlockCalendar({ blockId: block.id, userId })));
  return {
    synced: results.filter(result => result.ok).length,
    failed: results.filter(result => !result.ok).length,
  };
}

export async function deleteQuestionBlockWithCalendar({ block, userId }: { block: QuestionBlock; userId: string }) {
  if (block.calendar_event_id) {
    await supabase
      .from("question_blocks")
      .update({ calendar_sync_status: "pending" })
      .eq("id", block.id)
      .eq("user_id", userId);
    const result = await deleteCalendarEventWithAuth(block.calendar_event_id);
    if (!result.ok) {
      await supabase
        .from("question_blocks")
        .update(calendarSyncFailurePatch(result.message))
        .eq("id", block.id)
        .eq("user_id", userId);
      throw new Error(result.message);
    }
  }

  const { error } = await supabase
    .from("question_blocks")
    .delete()
    .eq("id", block.id)
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível excluir o tema.");
}
