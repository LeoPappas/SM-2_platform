import type { DifficultyRating, QuestionBlock } from "./database.types";
import { persistAutomaticReviewSchedule, syncQuestionBlockCalendar, updateQuestionBlockAndSync } from "./calendar-sync";
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
    importance: block.importance,
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
    importance: block.importance,
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
      calendar_sync_status: block.calendar_sync_enabled ? "pending" as const : "disabled" as const,
      calendar_last_error: null,
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
  const calendar = await syncQuestionBlockCalendar({ blockId: block.id, userId });

  // A replay returns the originally committed result, even after an uncertain response.
  const savedCalculation = { ...calculation,
    accuracy: saved.review.accuracy_percentage,
    intervalDays: saved.review.new_interval_days ?? calculation.intervalDays,
    nextReviewDate: saved.review.new_next_review_date,
    performanceBand: saved.review.performance_band ?? calculation.performanceBand,
    calculationMode: saved.review.calculation_mode ?? calculation.calculationMode,
    fallsAfterExam: Boolean(examDate && saved.review.new_next_review_date > examDate),
  };
  return { calculation: savedCalculation, calendarError: calendar.ok ? null : calendar.message };
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
  const result = await updateQuestionBlockAndSync({
    blockId: block.id,
    userId,
    expectedRepetitions: block.repetitions,
    changes: {
      planned_review_date: date,
      planning_source: "manual",
      calendar_sync_status: block.calendar_sync_enabled ? "pending" : "disabled",
    },
  });
  return result.calendar;
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
  const result = await updateQuestionBlockAndSync({
    blockId: block.id,
    userId,
    expectedRepetitions: block.repetitions,
    changes: {
      planned_review_date: automaticDate,
      planning_source: "automatic",
      calendar_sync_status: block.calendar_sync_enabled ? "pending" : "disabled",
      calendar_last_error: null,
    },
  });
  return result.calendar;
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
      .eq("user_id", userId),
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
    .eq("user_id", userId);
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
  return { updated: results.length, calendarPending: results.filter(result => !result.calendar.ok).length };
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
  await updateQuestionBlockAndSync({
    blockId,
    userId,
    changes: { pre_exam_review_requested: requested, calendar_sync_status: "pending" },
  });
}

export function importanceToLegacyWeight(importance: QuestionBlock["importance"]) {
  return { alta: 3, media: 2, baixa: 1 }[importance];
}
