import { format, getISODay } from "date-fns";
import type { DifficultyRating, QuestionBlock } from "./database.types";
import { updateQuestionBlockAndSync } from "./calendar-sync";
import {
  ENGINE_VERSION,
  calculateNextInterval,
  calculatePriority,
  calculateUrgency,
  classifyPerformance,
  findNearestStudySlot,
  toLegacyGrade,
} from "./revision-engine";
import { supabase } from "./supabase";

export type CompleteReviewInput = {
  block: QuestionBlock;
  userId: string;
  reviewDate: string;
  questionCount: number;
  correctCount: number;
  perceivedDifficulty: DifficultyRating;
  timeSpentMinutes?: number | null;
  examDate?: string | null;
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
}: CompleteReviewInput) {
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

  const { error: reviewError } = await supabase.from("block_reviews").insert({
    block_id: block.id,
    user_id: userId,
    review_date: reviewDate,
    question_count: questionCount,
    correct_count: correctCount,
    accuracy_percentage: calculation.accuracy,
    perceived_difficulty: perceivedDifficulty,
    time_spent_minutes: timeSpentMinutes,
    sm2_grade_calculated: toLegacyGrade(calculation.performanceBand),
    previous_next_review_date: block.next_review_date,
    new_next_review_date: nextReviewDate,
    contact_type: "review",
    engine_version: ENGINE_VERSION,
    calculation_mode: calculation.calculationMode,
    performance_band: calculation.performanceBand,
    importance: block.importance,
    previous_interval_days: block.interval_days,
    new_interval_days: calculation.intervalDays,
    priority_score: Number(priorityScore.toFixed(4)),
  });

  if (reviewError) throw new Error("Erro ao salvar a revisão.");

  const { calendar } = await updateQuestionBlockAndSync({
    blockId: block.id,
    userId,
    changes: {
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
      planning_source: "automatic",
      backlog_since: null,
      backlog_urgency: null,
      pre_exam_review_requested: false,
      performance_band: calculation.performanceBand,
      calculation_mode: calculation.calculationMode,
      engine_version: ENGINE_VERSION,
      calendar_sync_status: block.calendar_sync_enabled ? "pending" : "disabled",
      calendar_last_error: null,
    },
  });

  return { calculation, calendarError: calendar.ok ? null : calendar.message };
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
      .select("study_days,daily_theme_capacity")
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

  const occupiedDates = (blocks ?? [])
    .filter(item => item.id !== excludeBlockId && item.planned_review_date)
    .map(item => item.planned_review_date as string);
  const date = findNearestStudySlot({
    targetDate,
    studyDays: profile.study_days,
    dailyCapacity: profile.daily_theme_capacity,
    occupiedDates,
    notBeforeDate: targetDate < format(new Date(), "yyyy-MM-dd")
      ? format(new Date(), "yyyy-MM-dd")
      : undefined,
  });
  if (!date) throw new Error("Não foi encontrado um slot de estudo disponível.");
  return date;
}

export async function rebalanceAutomaticReviewSlots({
  userId,
  studyDays,
  dailyCapacity,
}: {
  userId: string;
  studyDays: number[];
  dailyCapacity: number;
}) {
  const { data: blocks, error } = await supabase
    .from("question_blocks")
    .select("id,next_review_date,planned_review_date,planning_source,backlog_since,created_at")
    .eq("user_id", userId);
  if (error) throw new Error("As configurações foram salvas, mas não foi possível reorganizar os estudos.");

  const occupiedDates: string[] = [];
  const manualIds = new Set<string>();
  const manualCounts = new Map<string, number>();
  for (const block of (blocks ?? []).filter(item => item.planning_source === "manual" && item.planned_review_date)) {
    const date = block.planned_review_date as string;
    manualIds.add(block.id);
    const isStudyDay = studyDays.includes(getISODay(new Date(`${date}T12:00:00`)));
    const count = manualCounts.get(date) ?? 0;
    if (!isStudyDay || count >= dailyCapacity) continue;
    manualCounts.set(date, count + 1);
    occupiedDates.push(date);
  }
  const today = format(new Date(), "yyyy-MM-dd");
  const automaticBlocks = (blocks ?? [])
    .filter(block => !manualIds.has(block.id))
    .sort((a, b) => (a.backlog_since ?? "9999-12-31").localeCompare(b.backlog_since ?? "9999-12-31")
      || a.next_review_date.localeCompare(b.next_review_date)
      || a.created_at.localeCompare(b.created_at));

  const updates = [];
  for (const block of automaticBlocks) {
    const needsCurrentSlot = Boolean(block.backlog_since) || block.next_review_date < today;
    const targetDate = needsCurrentSlot ? today : block.next_review_date;
    const plannedReviewDate = findNearestStudySlot({
      targetDate,
      studyDays,
      dailyCapacity,
      occupiedDates,
      notBeforeDate: needsCurrentSlot ? today : undefined,
    });
    if (!plannedReviewDate) throw new Error("Não foi possível distribuir todos os temas nos novos slots.");
    occupiedDates.push(plannedReviewDate);
    if (block.planned_review_date !== plannedReviewDate || block.planning_source !== "automatic") {
      updates.push(updateQuestionBlockAndSync({
        blockId: block.id,
        userId,
        changes: {
          planned_review_date: plannedReviewDate,
          planning_source: "automatic",
          calendar_sync_status: "pending",
        },
      }));
    }
  }

  const results = await Promise.all(updates);
  if (results.some(result => !result.calendar.ok)) {
    throw new Error("As configurações foram salvas, mas alguns estudos não foram reorganizados.");
  }
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
