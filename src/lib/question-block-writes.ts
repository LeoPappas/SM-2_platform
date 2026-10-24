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

/**
 * The student's topic that is the same lesson, the same Lista MetaMed topic or,
 * for own topics, the same name. A topic is studied once and then only reviewed.
 */
export async function findExistingTopic({ userId, catalogItemId, canonicalTopicId, title, excludeBlockId }: {
  userId: string;
  catalogItemId: string | null;
  canonicalTopicId: string | null;
  title: string;
  excludeBlockId?: string;
}): Promise<ExistingTopic | null> {
  let query = supabase.from("question_blocks")
    .select("id,title,archived_at,study_date,last_review_date,next_review_date,planned_review_date")
    .eq("user_id", userId);
  if (catalogItemId) query = query.eq("catalog_item_id", catalogItemId);
  else if (canonicalTopicId) query = query.eq("canonical_topic_id", canonicalTopicId);
  else query = query.is("catalog_item_id", null).is("canonical_topic_id", null).ilike("title", title.replace(/[\\%_]/g, "\\$&"));
  if (excludeBlockId) query = query.neq("id", excludeBlockId);
  const { data, error } = await query.limit(1);
  if (error) throw new Error("Não foi possível conferir se o tema já foi cadastrado.");
  return data?.[0] ?? null;
}

export type ExistingTopic = Pick<QuestionBlock,
  "id" | "title" | "archived_at" | "study_date" | "last_review_date" | "next_review_date" | "planned_review_date">;

/** A second registration of a topic; the form shows where the student continues it. */
export class ExistingTopicError extends Error {
  constructor(readonly topic: ExistingTopic) {
    super(`"${topic.title}" já foi cadastrado.`);
    this.name = "ExistingTopicError";
  }
}

/** Archived topics leave the plan and the calendar but keep their history; restoring brings them back. */
export async function setQuestionBlockArchived({ block, userId, archived }: { block: QuestionBlock; userId: string; archived: boolean }) {
  const { error } = await supabase
    .from("question_blocks")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", block.id)
    .eq("user_id", userId);
  // 23505: an active copy of the same topic already exists.
  if (error?.code === "23505") throw new Error(`Já existe um tema ativo igual a "${block.title}". Arquive ou exclua o outro antes de restaurar este.`);
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
