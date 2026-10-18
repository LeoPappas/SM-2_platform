import type { QuestionBlock } from "./database.types";
import { supabase } from "./supabase";

/** Guarded writes for question_blocks: each one is scoped to the owner and rejects stale callers. */
export async function updateQuestionBlock({
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
  return data;
}

/** A stale automatic plan must never replace a manual move or a newer review. */
export async function persistAutomaticReviewSchedule({ block, userId, date, source }: {
  block: QuestionBlock;
  userId: string;
  date: string | null;
  source: "automatic" | null;
}) {
  const { data, error } = await supabase.from("question_blocks")
    .update({ planned_review_date: date, planning_source: source })
    .eq("id", block.id).eq("user_id", userId).eq("repetitions", block.repetitions)
    .or("planning_source.is.null,planning_source.eq.automatic")
    .select("*").maybeSingle();
  if (error) throw new Error("Não foi possível confirmar todas as datas da semana.");
  return { block: data };
}

/** Archived topics leave the plan and the calendar but keep their history; restoring brings them back. */
export async function setQuestionBlockArchived({ block, userId, archived }: { block: QuestionBlock; userId: string; archived: boolean }) {
  const { error } = await supabase
    .from("question_blocks")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", block.id)
    .eq("user_id", userId);
  if (error) throw new Error(archived ? "Não foi possível arquivar o tema." : "Não foi possível restaurar o tema.");
}

export async function deleteQuestionBlock({ block, userId }: { block: QuestionBlock; userId: string }) {
  const { error } = await supabase
    .from("question_blocks")
    .delete()
    .eq("id", block.id)
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível excluir o tema.");
}
