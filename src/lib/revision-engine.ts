import { addDays, differenceInCalendarDays, format } from "date-fns";
import type {
  CalculationMode,
  DifficultyRating,
  Importance,
  PerformanceBand,
  QuestionBlock,
} from "./database.types";
import {
  buildStudyWeekSlots,
  getWeekBounds,
  normalizeStudyAvailability,
  resolvePlanningWeek,
  studyCapacityForDate,
  type PlanningWeek,
  type StudyAvailabilityInput,
} from "./study-availability";

export { getWeekBounds, normalizeStudyAvailability, resolvePlanningWeek } from "./study-availability";
export type { StudyAvailability, StudyAvailabilityInput, WeekStartsOn, PlanningWeek, SavedPlanningWeek } from "./study-availability";

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
  /** Optional for existing consumers; true only for an early review chosen from spare capacity. */
  isAnticipation?: boolean;
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
  /** Reviews due by the end of this week that have no slot yet; they are not debt. */
  deferred: WeeklyPlanItem[];
  anticipations: WeeklyPlanItem[];
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
  dailyCapacities,
  occupiedDates = [],
  notBeforeDate,
  maximumDaysAhead = 730,
  availabilityForDate,
}: {
  targetDate: string;
  studyDays: number[];
  dailyCapacity: number;
  dailyCapacities?: Record<string, number> | null;
  occupiedDates?: string[];
  notBeforeDate?: string;
  maximumDaysAhead?: number;
  /** Resolve the saved override for each candidate date; return null to use the routine. */
  availabilityForDate?: (date: string) => StudyAvailabilityInput | null | undefined;
}) {
  const routine = normalizeStudyAvailability({ studyDays, dailyCapacity, dailyCapacities });
  if (!availabilityForDate && Object.values(routine.dailyCapacities).every(value => value === 0)) return null;
  const occupancy = countDates(occupiedDates);
  const capacityForDate = (date: string) => studyCapacityForDate(date, availabilityForDate?.(date) ?? routine);
  const hasCapacity = (date: Date) => {
    const value = format(date, "yyyy-MM-dd");
    return (!notBeforeDate || value >= notBeforeDate)
      && (occupancy.get(value) ?? 0) < capacityForDate(value);
  };
  const earliestTarget = notBeforeDate && targetDate < notBeforeDate ? notBeforeDate : targetDate;
  const target = parseDate(earliestTarget);

  if (hasCapacity(target)) return earliestTarget;

  // Only the closest study day before the target is considered. If it is full,
  // preserve interval order by moving forward instead of walking farther back.
  for (let offset = 1; offset <= 7; offset += 1) {
    const previous = addDays(target, -offset);
    if (capacityForDate(format(previous, "yyyy-MM-dd")) < 1) continue;
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
  dailyCapacities,
  referenceDate,
  weekStartsOn = 1,
  notBeforeDate = referenceDate,
  occupiedDates = [],
  completedWork = [],
  includeAnticipations = false,
  examDate,
  config = DEFAULT_ENGINE_CONFIG,
}: {
  blocks: QuestionBlock[];
  studyDays: number[];
  dailyCapacity: number;
  dailyCapacities?: Record<string, number> | null;
  referenceDate: string;
  weekStartsOn?: number;
  notBeforeDate?: string;
  occupiedDates?: string[];
  /** Each record consumes one slot and prevents another review of that block in this week. */
  completedWork?: { blockId: string; date: string }[];
  includeAnticipations?: boolean;
  examDate?: string | null;
  config?: EngineConfig;
}): WeeklyPlan {
  const reference = parseDate(referenceDate);
  const { weekStart, weekEnd } = getWeekBounds(referenceDate, weekStartsOn);
  const allSlots = buildStudyWeekSlots(weekStart, { studyDays, dailyCapacity, dailyCapacities });
  const capacity = allSlots.length;
  const unoccupiedSlots = [...allSlots];
  let completedCapacityUsed = 0;
  for (const date of [...occupiedDates, ...completedWork.map(work => work.date)]) {
    if (removeOneSlot(unoccupiedSlots, date)) completedCapacityUsed += 1;
  }
  const availableSlots = unoccupiedSlots.filter(date => date >= notBeforeDate);
  const completedIds = new Set(completedWork
    .filter(work => work.date >= weekStart && work.date <= weekEnd)
    .map(work => work.blockId));

  const evaluated = blocks.filter(block => !completedIds.has(block.id)).map(block => {
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
      block.planning_source === "manual"
      && block.planned_review_date,
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
      isAnticipation: false,
    } satisfies WeeklyPlanItem;
  });

  const preExam = evaluated
    .filter(item => item.block.pre_exam_review_requested && (!item.manuallyScheduled
      || (item.block.planned_review_date! >= weekStart && item.block.planned_review_date! <= weekEnd)))
    .sort(sortByPriority);
  const existingBacklog = evaluated
    .filter(item => item.block.backlog_since && !item.block.pre_exam_review_requested && !item.manuallyScheduled)
    .sort(sortBacklogFifo);
  const dueThisWeek = evaluated
    .filter(item => item.block.next_review_date <= weekEnd && !item.block.backlog_since
      && !item.block.pre_exam_review_requested && !item.manuallyScheduled)
    .sort(sortByPriority);
  const possibleAnticipations = evaluated
    .filter(item => item.eligible && item.block.next_review_date > weekEnd && !item.block.backlog_since
      && !item.block.pre_exam_review_requested && !item.manuallyScheduled)
    .sort(sortByPriority);

  const manualItems = evaluated
    .filter(item => item.manuallyScheduled && item.block.planned_review_date!
      >= weekStart && item.block.planned_review_date! <= weekEnd && item.block.planned_review_date! >= notBeforeDate)
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
  const selected: WeeklyPlanItem[] = [...manualPlanned];
  const overflow: WeeklyPlanItem[] = evaluated.filter(item => item.manuallyScheduled
    && item.block.planned_review_date! < notBeforeDate
    && ((item.block.planned_review_date! >= weekStart && item.block.planned_review_date! <= weekEnd
      && !item.block.pre_exam_review_requested)
      || (item.block.planned_review_date! < weekStart && Boolean(item.block.backlog_since))));
  const automaticQueue = [
    ...existingBacklog,
    ...dueThisWeek,
  ].filter(uniqueByBlock);

  for (const item of automaticQueue) {
    const scheduledDate = item.block.backlog_since
      ? remainingSlots[0] ?? null
      : takeNearestWeeklySlot(remainingSlots, allSlots.filter(date => date >= notBeforeDate), item.block.next_review_date);
    if (!scheduledDate) {
      overflow.push(item);
      continue;
    }
    removeOneSlot(remainingSlots, scheduledDate);
    selected.push({ ...item, scheduledDate });
  }

  if (includeAnticipations) {
    for (const item of possibleAnticipations.filter(uniqueByBlock)) {
      const scheduledDate = remainingSlots.at(-1) ?? null;
      if (!scheduledDate) break;
      removeOneSlot(remainingSlots, scheduledDate);
      selected.push({ ...item, scheduledDate, isAnticipation: true });
    }
  }

  selected.push(...manualExtras);
  selected.sort(sortByScheduledDate);

  const backlog = overflow.filter(item => item.block.backlog_since).filter(uniqueByBlock).sort(sortBacklogFifo);
  const deferred = overflow.filter(item => !item.block.backlog_since).filter(uniqueByBlock).sort(sortByPriority);
  // Debt is created by the atomic week-close operation, never by a capacity calculation.
  const backlogUpdates: BacklogUpdate[] = [];

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
    ...deferred.map(item => item.block.id),
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
    deferred,
    anticipations: selected.filter(item => item.isAnticipation),
    upcoming,
    preExam,
    capacity,
    capacityUsed: Math.min(capacity, completedCapacityUsed + selected.filter(item => !item.isExtra).length),
    extraCount: manualExtras.length,
    backlogUpdates,
    scheduleUpdates,
    backlogAtRisk,
  };
}

/**
 * Redistributes each block's next review once, using the same queue as the home page.
 * It does not simulate later reviews or create debt for future weeks.
 */
export function buildAutomaticRebalanceUpdates({
  blocks,
  studyDays,
  dailyCapacity,
  dailyCapacities,
  referenceDate,
  weekStartsOn = 1,
  completedWork = [],
  occupiedDates = [],
  includeAnticipations = true,
  maximumWeeks = 105,
  availabilityForDate,
  weekForDate,
  config = DEFAULT_ENGINE_CONFIG,
}: {
  blocks: QuestionBlock[];
  studyDays: number[];
  dailyCapacity: number;
  dailyCapacities?: Record<string, number> | null;
  referenceDate: string;
  weekStartsOn?: number;
  completedWork?: { blockId: string; date: string }[];
  occupiedDates?: string[];
  includeAnticipations?: boolean;
  maximumWeeks?: number;
  /** Called with each week's first date; resolve that week's persisted exception. */
  availabilityForDate?: (date: string) => StudyAvailabilityInput | null | undefined;
  /** Resolve the actual saved anchor, including weeks preserved across preference changes. */
  weekForDate?: (date: string) => PlanningWeek;
  config?: EngineConfig;
}): { updates: ScheduleUpdate[]; unscheduledBlockIds: string[] } {
  const manual = blocks.filter(block => block.planning_source === "manual" && block.planned_review_date);
  const manualIds = new Set(manual.map(block => block.id));
  const candidates = blocks.filter(block => !manualIds.has(block.id) && !block.pre_exam_review_requested);
  const unassigned = new Map(candidates.map(block => [block.id, block]));
  const assignments = new Map<string, string>();
  const routine = { studyDays, dailyCapacity, dailyCapacities };
  const weeks = Number.isFinite(maximumWeeks) ? Math.max(0, Math.floor(maximumWeeks)) : 105;
  let cursor = referenceDate;

  for (let offset = 0; offset < weeks && unassigned.size > 0; offset += 1) {
    const week = weekForDate?.(cursor) ?? resolvePlanningWeek(cursor, weekStartsOn);
    const availability = availabilityForDate?.(week.weekStart) ?? routine;
    const plan = buildWeeklyPlan({
      blocks: [...manual, ...unassigned.values()],
      ...availability,
      referenceDate: week.weekStart,
      // Saved anchors can overlap after a preference change. Never reuse a day already planned.
      notBeforeDate: cursor > referenceDate ? cursor : referenceDate,
      weekStartsOn: week.weekStartsOn,
      completedWork,
      occupiedDates,
      includeAnticipations,
      config,
    });
    for (const item of plan.selected) {
      if (!unassigned.has(item.block.id) || !item.scheduledDate) continue;
      assignments.set(item.block.id, item.scheduledDate);
      unassigned.delete(item.block.id);
    }
    cursor = format(addDays(parseDate(week.weekEnd), 1), "yyyy-MM-dd");
  }

  const updates: ScheduleUpdate[] = [];
  for (const block of candidates) {
    const date = assignments.get(block.id) ?? null;
    const source = date ? "automatic" : null;
    if (block.planned_review_date === date && block.planning_source === source) continue;
    updates.push({ id: block.id, planned_review_date: date, planning_source: source });
  }
  return { updates, unscheduledBlockIds: [...unassigned.keys()] };
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
