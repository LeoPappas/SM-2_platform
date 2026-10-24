import type { BlockReview, DifficultyRating, QuestionBlock } from "./database.types";
import { persistAutomaticReviewSchedule, updateQuestionBlock } from "./question-block-writes";
import {
  ENGINE_VERSION,
  buildAutomaticRebalanceUpdates,
  calculateNextInterval,
  calculatePriority,
  calculateUrgency,
  classifyPerformance,
  findNearestStudySlot,
  normalizeStudyAvailability,
  toLegacyGrade,
} from "./revision-engine";
import { supabase } from "./supabase";
import { planningToday } from "./planning-date";
import { resolvePlanningWeek } from "./study-availability";

export type CompleteReviewInput = {
  block: QuestionBlock;
  userId: string;
  reviewDate: string;
  questionCount: number;
  correctCount: number;
  perceivedDifficulty: DifficultyRating;
  timeSpentMinutes?: number | null;
  examDate?: string | null;
  operationId: string;
};

export async function completeBlockReview({
  block,
  userId,
  reviewDate,
  questionCount,
  correctCount,
  perceivedDifficulty,
  timeSpentMinutes = null,
  examDate,
  operationId,
}: CompleteReviewInput) {
  if (!Number.isInteger(questionCount) || questionCount < 1
    || !Number.isInteger(correctCount) || correctCount < 0 || correctCount > questionCount) {
    throw new Error("Informe uma quantidade válida de questões e acertos.");
  }
  const calculation = calculateNextInterval({
    questionCount,
    correctCount,
    perceivedDifficulty,
    relevance: block.engine_relevance,
    previousIntervalDays: block.interval_days,
    isFirstContact: false,
    reviewDate,
    examDate,
  });
  const nextReviewDate = calculation.nextReviewDate;
  if (!nextReviewDate) throw new Error("Não foi possível calcular a próxima revisão.");
  const plannedReviewDate = await findAutomaticReviewDate({
    userId,
    targetDate: nextReviewDate,
    excludeBlockId: block.id,
  });

  const urgency = calculateUrgency({
    lastReviewDate: block.last_review_date ?? block.study_date,
    intervalDays: block.interval_days,
    asOfDate: reviewDate,
    frozenUrgency: block.backlog_urgency,
  });
  const priorityScore = calculatePriority({
    urgency,
    performanceBand: block.performance_band ?? classifyPerformance(block.accuracy_percentage),
    relevance: block.engine_relevance,
  });

  const review = {
    expected_repetitions: block.repetitions,
    review_date: reviewDate,
    question_count: questionCount,
    correct_count: correctCount,
    accuracy_percentage: calculation.accuracy,
    perceived_difficulty: perceivedDifficulty,
    time_spent_minutes: timeSpentMinutes,
    sm2_grade_calculated: toLegacyGrade(calculation.performanceBand),
    previous_next_review_date: block.next_review_date,
    new_next_review_date: nextReviewDate,
    contact_type: "review" as const,
    engine_version: ENGINE_VERSION,
    calculation_mode: calculation.calculationMode,
    performance_band: calculation.performanceBand,
    importance: block.importance,
    previous_interval_days: block.interval_days,
    new_interval_days: calculation.intervalDays,
    priority_score: Number(priorityScore.toFixed(4)),
  };
  const changes = {
      question_count: questionCount,
      correct_count: correctCount,
      accuracy_percentage: calculation.accuracy,
      perceived_difficulty: perceivedDifficulty,
      time_spent_minutes: timeSpentMinutes,
      repetitions: block.repetitions + 1,
      interval_days: calculation.intervalDays,
      next_review_date: nextReviewDate,
      last_review_date: reviewDate,
      planned_review_date: plannedReviewDate,
      planning_source: "automatic" as const,
      backlog_since: null,
      backlog_urgency: null,
      pre_exam_review_requested: false,
      performance_band: calculation.performanceBand,
      calculation_mode: calculation.calculationMode,
      engine_version: ENGINE_VERSION,
  };
  const { data: saved, error: reviewError } = await supabase.rpc("complete_block_review", {
    p_block_id: block.id,
    p_operation_id: operationId,
    p_review: review,
    p_changes: changes,
  });
  if (reviewError || !saved) {
    if (reviewError?.message.includes("changed") || reviewError?.message.includes("alterad")) {
      throw new Error("Este tema foi atualizado em outra sessão. Atualize a página antes de registrar outra revisão.");
    }
    throw new Error("Não foi possível confirmar o salvamento da revisão. Tente novamente para concluir a mesma operação.");
  }

  // A replay returns the originally committed result, even after an uncertain response.
  const savedCalculation = { ...calculation,
    accuracy: saved.review.accuracy_percentage,
    intervalDays: saved.review.new_interval_days ?? calculation.intervalDays,
    nextReviewDate: saved.review.new_next_review_date,
    performanceBand: saved.review.performance_band ?? calculation.performanceBand,
    calculationMode: saved.review.calculation_mode ?? calculation.calculationMode,
    fallsAfterExam: Boolean(examDate && saved.review.new_next_review_date > examDate),
  };
  return { calculation: savedCalculation };
}

/**
 * The session a student may still correct: the first contact before any review,
 * else the newest review. Also returns the date it cannot go before.
 */
export async function loadLastSession(block: QuestionBlock): Promise<{ session: BlockReview | null; previousDate: string | null }> {
  const { data, error } = await supabase
    .from("block_reviews")
    .select("*")
    .eq("block_id", block.id)
    .eq("user_id", block.user_id)
    .order("review_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar a última sessão.");
  const sessions = data ?? [];
  const lastType = block.repetitions === 0 ? "first_contact" : "review";
  const session = sessions.find(item => item.contact_type === lastType) ?? null;
  if (!session || session.contact_type === "first_contact") return { session, previousDate: null };
  const previous = sessions.find(item => item.id !== session.id);
  return { session, previousDate: previous?.review_date ?? block.study_date };
}

export type EditLastSessionInput = {
  block: QuestionBlock;
  session: BlockReview;
  userId: string;
  reviewDate: string;
  questionCount: number;
  correctCount: number;
  perceivedDifficulty: DifficultyRating;
  timeSpentMinutes?: number | null;
  examDate?: string | null;
};

/** The next review the corrected numbers lead to, from the same starting point the session had. */
export function recalculateSession({ block, session, reviewDate, questionCount, correctCount, perceivedDifficulty, examDate }: Omit<EditLastSessionInput, "userId" | "timeSpentMinutes">) {
  return calculateNextInterval({
    questionCount,
    correctCount,
    perceivedDifficulty,
    relevance: session.engine_relevance ?? block.engine_relevance,
    previousIntervalDays: session.previous_interval_days ?? undefined,
    isFirstContact: session.contact_type === "first_contact",
    reviewDate,
    examDate,
  });
}

export async function editLastBlockSession(input: EditLastSessionInput) {
  const { block, session, userId, reviewDate, questionCount, correctCount, perceivedDifficulty, timeSpentMinutes = null } = input;
  if (!Number.isInteger(questionCount) || questionCount < 1
    || !Number.isInteger(correctCount) || correctCount < 0 || correctCount > questionCount) {
    throw new Error("Informe uma quantidade válida de questões e acertos.");
  }
  if (session.contact_type === "review" && session.previous_interval_days == null) {
    throw new Error("Esta revisão foi registrada antes do cálculo atual e não pode ser editada.");
  }
  const calculation = recalculateSession(input);
  if (!calculation.nextReviewDate) throw new Error("Não foi possível calcular a próxima revisão.");
  // The database keeps the planned day when the calculated date is unchanged.
  const plannedReviewDate = calculation.nextReviewDate === block.next_review_date
    ? block.planned_review_date
    : await findAutomaticReviewDate({
      userId,
      targetDate: calculation.nextReviewDate,
      excludeBlockId: block.id,
    });

  const { data: saved, error } = await supabase.rpc("edit_last_block_session", {
    p_block_id: block.id,
    p_review_id: session.id,
    p_expected_repetitions: block.repetitions,
    p_session: {
      review_date: reviewDate,
      question_count: questionCount,
      correct_count: correctCount,
      accuracy_percentage: calculation.accuracy,
      perceived_difficulty: perceivedDifficulty,
      time_spent_minutes: timeSpentMinutes,
      sm2_grade_calculated: toLegacyGrade(calculation.performanceBand),
      new_next_review_date: calculation.nextReviewDate,
      new_interval_days: calculation.intervalDays,
      calculation_mode: calculation.calculationMode,
      performance_band: calculation.performanceBand,
      engine_version: ENGINE_VERSION,
    },
    p_planned_review_date: plannedReviewDate,
  });
  if (error || !saved) {
    if (error?.message.includes("changed") || error?.message.includes("last session")) {
      throw new Error("Este tema recebeu outra sessão enquanto você editava. Atualize a página e tente de novo.");
    }
    throw new Error("Não foi possível salvar a sessão. Tente novamente.");
  }
  return { calculation, plannedReviewDate };
}

export async function scheduleBlockReview({
  block,
  userId,
  date,
}: {
  block: QuestionBlock;
  userId: string;
  date: string;
}) {
  await updateQuestionBlock({
    blockId: block.id,
    userId,
    expectedRepetitions: block.repetitions,
    changes: {
      planned_review_date: date,
      planning_source: "manual",
    },
  });
}

export async function unscheduleBlockReview({
  block,
  userId,
}: {
  block: QuestionBlock;
  userId: string;
}) {
  const automaticDate = await findAutomaticReviewDate({
    userId,
    targetDate: block.next_review_date,
    excludeBlockId: block.id,
  });
  await updateQuestionBlock({
    blockId: block.id,
    userId,
    expectedRepetitions: block.repetitions,
    changes: {
      planned_review_date: automaticDate,
      planning_source: "automatic",
    },
  });
}

export async function findAutomaticReviewDate({
  userId,
  targetDate,
  excludeBlockId,
}: {
  userId: string;
  targetDate: string;
  excludeBlockId?: string;
}) {
  const [{ data: profile, error: profileError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("*")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("question_blocks")
      .select("id,planned_review_date")
      .eq("user_id", userId)
      .is("archived_at", null),
  ]);
  if (profileError || blocksError || !profile) {
    throw new Error("Não foi possível localizar seus slots de estudo.");
  }
  const { data: overrides, error: overrideError } = await supabase
    .from("weekly_plans").select("*").eq("user_id", userId);
  if (overrideError) throw new Error("Não foi possível consultar sua disponibilidade semanal.");
  const availabilityForDate = (date: string) => {
    const week = resolvePlanningWeek(date, profile.week_starts_on ?? 1, overrides ?? []);
    const override = overrides?.find(item => item.week_start === week.weekStart);
    return normalizeStudyAvailability({
      studyDays: override?.study_days ?? profile.study_days,
      dailyCapacity: profile.daily_theme_capacity,
      dailyCapacities: override?.daily_capacities ?? profile.daily_capacities ?? undefined,
    });
  };

  const occupiedDates = (blocks ?? [])
    .filter(item => item.id !== excludeBlockId && item.planned_review_date)
    .map(item => item.planned_review_date as string);
  const date = findNearestStudySlot({
    targetDate,
    studyDays: profile.study_days,
    dailyCapacity: profile.daily_theme_capacity,
    dailyCapacities: profile.daily_capacities ?? undefined,
    availabilityForDate,
    occupiedDates,
    notBeforeDate: planningToday(profile.timezone),
  });
  return date;
}

export async function rebalanceAutomaticReviewSlots({
  userId,
  studyDays,
  dailyCapacity,
  dailyCapacities,
  weekStartsOn = 1,
  timezone = "America/Sao_Paulo",
}: {
  userId: string;
  studyDays: number[];
  dailyCapacity: number;
  dailyCapacities?: Record<string, number> | null;
  weekStartsOn?: number;
  timezone?: string;
}) {
  const { data: blocks, error } = await supabase
    .from("question_blocks")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (error) throw new Error("As configurações foram salvas, mas não foi possível reorganizar os estudos.");
  const { data: overrides, error: overrideError } = await supabase
    .from("weekly_plans").select("*").eq("user_id", userId);
  if (overrideError) throw new Error("Não foi possível consultar a disponibilidade das semanas.");
  const availabilityForDate = (date: string) => {
    const week = resolvePlanningWeek(date, weekStartsOn, overrides ?? []);
    const override = overrides?.find(item => item.week_start === week.weekStart);
    return normalizeStudyAvailability({
      studyDays: override?.study_days ?? studyDays,
      dailyCapacity,
      dailyCapacities: override?.daily_capacities ?? dailyCapacities ?? undefined,
    });
  };

  const today = planningToday(timezone);
  const week = resolvePlanningWeek(today, weekStartsOn, overrides ?? []);
  const { data: reviews, error: reviewsError } = await supabase.from("block_reviews")
    .select("block_id,review_date").eq("user_id", userId).eq("contact_type", "review")
    .gte("review_date", week.weekStart).lte("review_date", today);
  if (reviewsError) throw new Error("As configurações foram salvas, mas não foi possível conferir as revisões concluídas.");
  const { updates } = buildAutomaticRebalanceUpdates({
    blocks: blocks ?? [], studyDays, dailyCapacity, dailyCapacities,
    referenceDate: today, weekStartsOn, availabilityForDate,
    weekForDate: date => resolvePlanningWeek(date, weekStartsOn, overrides ?? []),
    completedWork: (reviews ?? []).map(review => ({ blockId: review.block_id, date: review.review_date })),
  });
  const results = await Promise.all(updates.map(update => persistAutomaticReviewSchedule({
    block: blocks!.find(block => block.id === update.id)!, userId,
    date: update.planned_review_date, source: update.planning_source,
  })));
  return { updated: results.filter(result => result.block).length };
}

export async function setPreExamReviewRequest({
  blockId,
  userId,
  requested,
}: {
  blockId: string;
  userId: string;
  requested: boolean;
}) {
  await updateQuestionBlock({
    blockId,
    userId,
    changes: { pre_exam_review_requested: requested },
  });
}

export function importanceToLegacyWeight(importance: QuestionBlock["importance"]) {
  return { alta: 3, media: 2, baixa: 1 }[importance];
}
