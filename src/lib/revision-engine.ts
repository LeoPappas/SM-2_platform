import { addDays, differenceInCalendarDays, endOfWeek, format, getISODay, isWithinInterval, startOfWeek } from "date-fns";
import type {
  CalculationMode,
  DifficultyRating,
  Importance,
  PerformanceBand,
  QuestionBlock,
} from "./database.types";

export const ENGINE_VERSION = "metamed-v1";
export const SMALL_SAMPLE_THRESHOLD = 20;

export type EngineConfig = {
  minimumIntervalDays: number;
  maximumIntervalDays: number;
  eligibilityThreshold: number;
  firstIntervals: Record<PerformanceBand, number>;
  performanceFactors: Record<PerformanceBand, number>;
  importanceFactors: Record<Importance, number>;
  difficultyFactors: Record<DifficultyRating, number>;
  smallSampleFirstIntervals: Record<DifficultyRating, number>;
  smallSampleFactors: Record<DifficultyRating, number>;
  weaknessFactors: Record<PerformanceBand, number>;
  priorityImportance: Record<Importance, number>;
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  minimumIntervalDays: 7,
  maximumIntervalDays: 180,
  eligibilityThreshold: 0.8,
  firstIntervals: {
    muito_ruim: 7,
    ruim: 10,
    bom: 14,
    muito_bom: 21,
  },
  performanceFactors: {
    muito_ruim: 0.8,
    ruim: 1.3,
    bom: 3,
    muito_bom: 6,
  },
  importanceFactors: {
    alta: 0.8,
    media: 1,
    baixa: 1.2,
  },
  difficultyFactors: {
    "Muito fácil": 1.2,
    Fácil: 1.1,
    Médio: 1,
    Difícil: 0.9,
    "Muito difícil": 0.8,
  },
  smallSampleFirstIntervals: {
    "Muito fácil": 21,
    Fácil: 18,
    Médio: 14,
    Difícil: 10,
    "Muito difícil": 7,
  },
  smallSampleFactors: {
    "Muito fácil": 6,
    Fácil: 4.5,
    Médio: 3,
    Difícil: 1.3,
    "Muito difícil": 0.8,
  },
  weaknessFactors: {
    muito_bom: 1,
    bom: 1.3,
    ruim: 1.7,
    muito_ruim: 2.2,
  },
  priorityImportance: {
    alta: 3,
    media: 2,
    baixa: 1,
  },
};

export type IntervalCalculationInput = {
  questionCount: number;
  correctCount: number;
  perceivedDifficulty: DifficultyRating;
  importance: Importance;
  previousIntervalDays?: number;
  isFirstContact: boolean;
  reviewDate?: string;
  examDate?: string | null;
  config?: EngineConfig;
};

export type IntervalCalculationResult = {
  accuracy: number;
  performanceBand: PerformanceBand;
  calculationMode: CalculationMode;
  rawIntervalDays: number;
  intervalDays: number;
  nextReviewDate: string | null;
  hitMinimum: boolean;
  hitMaximum: boolean;
  fallsAfterExam: boolean;
};

export function calculateAccuracy(correctCount: number, questionCount: number) {
  if (questionCount <= 0) return 0;
  return Math.round((Math.max(0, correctCount) / questionCount) * 100);
}

export function classifyPerformance(accuracy: number): PerformanceBand {
  if (accuracy >= 85) return "muito_bom";
  if (accuracy >= 70) return "bom";
  if (accuracy >= 50) return "ruim";
  return "muito_ruim";
}

export function getCalculationMode(questionCount: number): CalculationMode {
  return questionCount < SMALL_SAMPLE_THRESHOLD ? "small_sample" : "performance";
}

export function calculateNextInterval({
  questionCount,
  correctCount,
  perceivedDifficulty,
  importance,
  previousIntervalDays = DEFAULT_ENGINE_CONFIG.minimumIntervalDays,
  isFirstContact,
  reviewDate,
  examDate,
  config = DEFAULT_ENGINE_CONFIG,
}: IntervalCalculationInput): IntervalCalculationResult {
  const accuracy = calculateAccuracy(correctCount, questionCount);
  const performanceBand = classifyPerformance(accuracy);
  const calculationMode = getCalculationMode(questionCount);

  let rawIntervalDays: number;
  if (isFirstContact) {
    rawIntervalDays = calculationMode === "small_sample"
      ? config.smallSampleFirstIntervals[perceivedDifficulty]
      : config.firstIntervals[performanceBand];
  } else if (calculationMode === "small_sample") {
    rawIntervalDays = previousIntervalDays
      * config.smallSampleFactors[perceivedDifficulty]
      * config.importanceFactors[importance];
  } else {
    rawIntervalDays = previousIntervalDays
      * config.performanceFactors[performanceBand]
      * config.importanceFactors[importance]
      * config.difficultyFactors[perceivedDifficulty];
  }

  const roundedInterval = Math.round(rawIntervalDays);
  const intervalDays = Math.min(
    config.maximumIntervalDays,
    Math.max(config.minimumIntervalDays, roundedInterval),
  );
  const nextReviewDate = reviewDate
    ? format(addDays(parseDate(reviewDate), intervalDays), "yyyy-MM-dd")
    : null;

  return {
    accuracy,
    performanceBand,
    calculationMode,
    rawIntervalDays,
    intervalDays,
    nextReviewDate,
    hitMinimum: roundedInterval < config.minimumIntervalDays,
    hitMaximum: roundedInterval > config.maximumIntervalDays,
    fallsAfterExam: Boolean(nextReviewDate && examDate && nextReviewDate > examDate),
  };
}

export function calculateUrgency({
  lastReviewDate,
  intervalDays,
  asOfDate,
  frozenUrgency,
}: {
  lastReviewDate: string;
  intervalDays: number;
  asOfDate: string;
  frozenUrgency?: number | null;
}) {
  if (frozenUrgency !== null && frozenUrgency !== undefined) return frozenUrgency;
  const elapsedDays = Math.max(0, differenceInCalendarDays(parseDate(asOfDate), parseDate(lastReviewDate)));
  return elapsedDays / Math.max(1, intervalDays);
}

export function calculatePriority({
  urgency,
  performanceBand,
  importance,
  config = DEFAULT_ENGINE_CONFIG,
}: {
  urgency: number;
  performanceBand: PerformanceBand;
  importance: Importance;
  config?: EngineConfig;
}) {
  return urgency * config.weaknessFactors[performanceBand] * config.priorityImportance[importance];
}

export type WeeklyPlanItem = {
  block: QuestionBlock;
  currentUrgency: number;
  effectiveUrgency: number;
  priority: number;
  eligible: boolean;
  manuallyScheduled: boolean;
  isExtra: boolean;
  scheduledDate: string | null;
};

export type BacklogUpdate = {
  id: string;
  backlog_since: string;
  backlog_urgency: number;
};

export type ScheduleUpdate = {
  id: string;
  planned_review_date: string | null;
  planning_source: "automatic" | null;
};

export type WeeklyPlan = {
  weekStart: string;
  weekEnd: string;
  selected: WeeklyPlanItem[];
  backlog: WeeklyPlanItem[];
  upcoming: WeeklyPlanItem[];
  preExam: WeeklyPlanItem[];
  capacity: number;
  capacityUsed: number;
  extraCount: number;
  backlogUpdates: BacklogUpdate[];
  scheduleUpdates: ScheduleUpdate[];
  backlogAtRisk: boolean;
};

export function findNearestStudySlot({
  targetDate,
  studyDays,
  dailyCapacity,
  occupiedDates = [],
  notBeforeDate,
  maximumDaysAhead = 730,
}: {
  targetDate: string;
  studyDays: number[];
  dailyCapacity: number;
  occupiedDates?: string[];
  notBeforeDate?: string;
  maximumDaysAhead?: number;
}) {
  if (studyDays.length === 0 || dailyCapacity < 1) return null;

  const normalizedStudyDays = new Set(studyDays);
  const occupancy = countDates(occupiedDates);
  const hasCapacity = (date: Date) => {
    const value = format(date, "yyyy-MM-dd");
    return normalizedStudyDays.has(getISODay(date))
      && (!notBeforeDate || value >= notBeforeDate)
      && (occupancy.get(value) ?? 0) < dailyCapacity;
  };
  const target = parseDate(targetDate);

  if (hasCapacity(target)) return targetDate;

  // Only the closest study day before the target is considered. If it is full,
  // preserve interval order by moving forward instead of walking farther back.
  for (let offset = 1; offset <= 7; offset += 1) {
    const previous = addDays(target, -offset);
    if (!normalizedStudyDays.has(getISODay(previous))) continue;
    if (hasCapacity(previous)) return format(previous, "yyyy-MM-dd");
    break;
  }

  for (let offset = 1; offset <= maximumDaysAhead; offset += 1) {
    const next = addDays(target, offset);
    if (hasCapacity(next)) return format(next, "yyyy-MM-dd");
  }

  return null;
}

export function buildWeeklyPlan({
  blocks,
  studyDays,
  dailyCapacity,
  referenceDate,
  examDate,
  config = DEFAULT_ENGINE_CONFIG,
}: {
  blocks: QuestionBlock[];
  studyDays: number[];
  dailyCapacity: number;
  referenceDate: string;
  examDate?: string | null;
  config?: EngineConfig;
}): WeeklyPlan {
  const reference = parseDate(referenceDate);
  const weekStartDate = startOfWeek(reference, { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(reference, { weekStartsOn: 1 });
  const weekStart = format(weekStartDate, "yyyy-MM-dd");
  const weekEnd = format(weekEndDate, "yyyy-MM-dd");
  const availableSlots = buildWeekSlots(weekStartDate, studyDays, dailyCapacity);
  const capacity = availableSlots.length;

  const evaluated = blocks.map(block => {
    const lastReviewDate = block.last_review_date ?? block.study_date;
    const currentUrgency = calculateUrgency({
      lastReviewDate,
      intervalDays: block.interval_days,
      asOfDate: weekEnd,
    });
    const effectiveUrgency = calculateUrgency({
      lastReviewDate,
      intervalDays: block.interval_days,
      asOfDate: weekEnd,
      frozenUrgency: block.backlog_urgency,
    });
    const performanceBand = block.performance_band ?? classifyPerformance(block.accuracy_percentage);
    const manuallyScheduled = Boolean(
      block.planned_review_date
      && isWithinInterval(parseDate(block.planned_review_date), {
        start: weekStartDate,
        end: weekEndDate,
      }),
    );

    return {
      block,
      currentUrgency,
      effectiveUrgency,
      priority: calculatePriority({
        urgency: effectiveUrgency,
        performanceBand,
        importance: block.importance,
        config,
      }),
      eligible: currentUrgency >= config.eligibilityThreshold,
      manuallyScheduled,
      isExtra: false,
      scheduledDate: null,
    } satisfies WeeklyPlanItem;
  });

  const preExam = evaluated
    .filter(item => item.block.pre_exam_review_requested)
    .sort(sortByPriority);
  const existingBacklog = evaluated
    .filter(item => item.block.backlog_since && !item.block.pre_exam_review_requested)
    .sort(sortBacklogFifo);
  const normalEligible = evaluated
    .filter(item => item.eligible && !item.block.backlog_since && !item.block.pre_exam_review_requested)
    .sort(sortByPriority);

  const manualItems = evaluated
    .filter(item => item.manuallyScheduled && item.block.planning_source === "manual")
    .map(item => ({ ...item, scheduledDate: item.block.planned_review_date }));
  const remainingSlots = [...availableSlots];
  const manualPlanned: WeeklyPlanItem[] = [];
  const manualExtras: WeeklyPlanItem[] = [];
  for (const item of manualItems) {
    if (removeOneSlot(remainingSlots, item.scheduledDate)) {
      manualPlanned.push(item);
    } else {
      manualExtras.push({ ...item, isExtra: true });
    }
  }
  const manualIds = new Set(manualItems.map(item => item.block.id));

  const selected: WeeklyPlanItem[] = [...manualPlanned];
  const overflow: WeeklyPlanItem[] = [];
  const automaticQueue = [
    ...existingBacklog.filter(item => !manualIds.has(item.block.id)),
    ...normalEligible.filter(item => !manualIds.has(item.block.id)),
  ].filter(uniqueByBlock);

  for (const item of automaticQueue) {
    const scheduledDate = item.block.backlog_since
      ? remainingSlots[0] ?? null
      : takeNearestWeeklySlot(remainingSlots, availableSlots, item.block.next_review_date);
    if (!scheduledDate) {
      overflow.push(item);
      continue;
    }
    removeOneSlot(remainingSlots, scheduledDate);
    selected.push({ ...item, scheduledDate });
  }

  selected.push(...manualExtras);
  selected.sort(sortByScheduledDate);

  const backlog = overflow.filter(uniqueByBlock).sort(sortBacklogFifo);

  const backlogUpdates = overflow
    .filter(item => !item.block.backlog_since)
    .map(item => ({
      id: item.block.id,
      backlog_since: weekStart,
      backlog_urgency: Number(item.currentUrgency.toFixed(4)),
    }));

  const scheduleUpdates: ScheduleUpdate[] = [
    ...selected
      .filter(item => item.block.planning_source !== "manual")
      .filter(item => item.block.planned_review_date !== item.scheduledDate)
      .map(item => ({
        id: item.block.id,
        planned_review_date: item.scheduledDate,
        planning_source: "automatic" as const,
      })),
    ...overflow
      .filter(item => item.block.planning_source === "automatic")
      .filter(item => item.block.planned_review_date !== null)
      .map(item => ({
        id: item.block.id,
        planned_review_date: null,
        planning_source: null,
      })),
  ];

  const occupiedIds = new Set([
    ...selected.map(item => item.block.id),
    ...backlog.map(item => item.block.id),
    ...preExam.map(item => item.block.id),
  ]);
  const upcoming = evaluated
    .filter(item => !occupiedIds.has(item.block.id))
    .sort((a, b) => a.block.next_review_date.localeCompare(b.block.next_review_date))
    .slice(0, 8);

  const weeksUntilExam = examDate
    ? Math.max(0, Math.ceil(differenceInCalendarDays(parseDate(examDate), reference) / 7))
    : null;
  const backlogAtRisk = weeksUntilExam !== null
    && backlog.length > weeksUntilExam * Math.max(1, capacity);

  return {
    weekStart,
    weekEnd,
    selected,
    backlog,
    upcoming,
    preExam,
    capacity,
    capacityUsed: Math.min(capacity, selected.filter(item => !item.isExtra).length),
    extraCount: manualExtras.length,
    backlogUpdates,
    scheduleUpdates,
    backlogAtRisk,
  };
}

export function toLegacyGrade(performanceBand: PerformanceBand) {
  return {
    muito_bom: 5,
    bom: 4,
    ruim: 2,
    muito_ruim: 0,
  }[performanceBand];
}

export function performanceLabel(performanceBand: PerformanceBand) {
  return {
    muito_bom: "Muito bom",
    bom: "Bom",
    ruim: "Ruim",
    muito_ruim: "Muito ruim",
  }[performanceBand];
}

export function importanceLabel(importance: Importance) {
  return {
    alta: "Alta",
    media: "Média",
    baixa: "Baixa",
  }[importance];
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function sortByPriority(a: WeeklyPlanItem, b: WeeklyPlanItem) {
  return b.priority - a.priority || a.block.title.localeCompare(b.block.title, "pt-BR");
}

function sortBacklogFifo(a: WeeklyPlanItem, b: WeeklyPlanItem) {
  return (a.block.backlog_since ?? "9999-12-31").localeCompare(b.block.backlog_since ?? "9999-12-31")
    || a.block.next_review_date.localeCompare(b.block.next_review_date)
    || a.block.created_at.localeCompare(b.block.created_at)
    || a.block.id.localeCompare(b.block.id);
}

function sortByScheduledDate(a: WeeklyPlanItem, b: WeeklyPlanItem) {
  return (a.scheduledDate ?? "9999-12-31").localeCompare(b.scheduledDate ?? "9999-12-31")
    || sortBacklogFifo(a, b)
    || sortByPriority(a, b);
}

function buildWeekSlots(weekStart: Date, studyDays: number[], dailyCapacity: number) {
  const allowedDays = new Set(studyDays);
  const slots: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(weekStart, offset);
    if (!allowedDays.has(getISODay(day))) continue;
    const date = format(day, "yyyy-MM-dd");
    for (let slot = 0; slot < dailyCapacity; slot += 1) slots.push(date);
  }
  return slots;
}

function takeNearestWeeklySlot(slots: string[], allSlots: string[], targetDate: string) {
  if (slots.includes(targetDate)) return targetDate;
  const previousStudyDate = allSlots.filter(date => date < targetDate).at(-1);
  if (previousStudyDate && slots.includes(previousStudyDate)) return previousStudyDate;
  return slots.find(date => date > targetDate) ?? null;
}

function removeOneSlot(slots: string[], date: string | null) {
  if (!date) return false;
  const index = slots.indexOf(date);
  if (index < 0) return false;
  slots.splice(index, 1);
  return true;
}

function countDates(dates: string[]) {
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  return counts;
}

function uniqueByBlock(item: WeeklyPlanItem, index: number, all: WeeklyPlanItem[]) {
  return all.findIndex(candidate => candidate.block.id === item.block.id) === index;
}
