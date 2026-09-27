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

  // Synchronization records outcomes; a stale result cannot change a newer preference or schedule.
  delete patch.calendar_sync_enabled;
  const { data: synced, error: patchError } = await supabase
    .from("question_blocks")
    .update(patch)
    .eq("id", blockId)
    .eq("user_id", userId)
    .eq("updated_at", block.updated_at)
    .select("id").maybeSingle();
  if (patchError) return { ok: false, message: "O Google Calendar foi atualizado, mas o estado de sincronização não foi salvo." };
  if (!synced) return { ok: false, message: "O agendamento mudou durante a sincronização. A nova data será sincronizada na próxima tentativa." };
  return outcome;
}

export async function updateQuestionBlockAndSync({
  blockId,
  userId,
  changes,
  expectedRepetitions,
}: {
  blockId: string;
  userId: string;
  changes: Partial<QuestionBlock>;
  expectedRepetitions?: number;
}) {
  let query = supabase
    .from("question_blocks")
    .update(changes)
    .eq("id", blockId)
    .eq("user_id", userId);
  if (expectedRepetitions !== undefined) query = query.eq("repetitions", expectedRepetitions);
  const { data, error } = await query
    .select("*")
    .maybeSingle();
  if (error) throw new Error("Não foi possível atualizar o tema.");
  if (!data) throw new Error("Este tema foi atualizado em outra sessão. Atualize a página antes de remarcar.");

  const outcome = await syncQuestionBlockCalendar({ blockId, userId });
  return { block: data, calendar: outcome };
}

/** A stale automatic plan must never replace a manual move or a newer review. */
export async function persistAutomaticReviewSchedule({ block, userId, date, source }: {
  block: QuestionBlock;
  userId: string;
  date: string | null;
  source: "automatic" | null;
}) {
  const { data, error } = await supabase.from("question_blocks")
    .update({ planned_review_date: date, planning_source: source,
      calendar_sync_status: block.calendar_sync_enabled ? "pending" : "disabled" })
    .eq("id", block.id).eq("user_id", userId).eq("repetitions", block.repetitions)
    .or("planning_source.is.null,planning_source.eq.automatic")
    .select("*").maybeSingle();
  if (error) throw new Error("Não foi possível confirmar todas as datas da semana.");
  if (!data) return { block: null, calendar: { ok: true } as SyncOutcome };
  const calendar = await syncQuestionBlockCalendar({ blockId: block.id, userId });
  // Return the committed sync state, so a successful sync is not shown as pending.
  const { data: latest } = await supabase.from("question_blocks").select("*")
    .eq("id", block.id).eq("user_id", userId).maybeSingle();
  return { block: latest ?? data, calendar };
}

export async function reconcileQuestionBlocksCalendar(userId: string) {
  const { data: blocks, error } = await supabase
    .from("question_blocks")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível consultar os agendamentos pendentes do Google Calendar.");

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
