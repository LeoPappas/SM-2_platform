import { describe, expect, it } from "vitest";
import type { QuestionBlock } from "./database.types";
import {
  buildWeeklyPlan,
  calculateAccuracy,
  calculateNextInterval,
  calculatePriority,
  calculateUrgency,
  classifyPerformance,
  findNearestStudySlot,
} from "./revision-engine";

describe("MetaMed revision engine", () => {
  it("classifies the four performance bands at their boundaries", () => {
    expect(classifyPerformance(49)).toBe("muito_ruim");
    expect(classifyPerformance(50)).toBe("ruim");
    expect(classifyPerformance(70)).toBe("bom");
    expect(classifyPerformance(85)).toBe("muito_bom");
  });

  it("calculates accuracy without trusting an invalid denominator", () => {
    expect(calculateAccuracy(17, 20)).toBe(85);
    expect(calculateAccuracy(4, 0)).toBe(0);
  });

  it("reproduces scenario 1 and reaches the 180 day ceiling", () => {
    const first = calculateNextInterval({
      questionCount: 20,
      correctCount: 16,
      perceivedDifficulty: "Médio",
      importance: "alta",
      isFirstContact: true,
    });
    const second = calculateNextInterval({
      questionCount: 20,
      correctCount: 18,
      perceivedDifficulty: "Médio",
      importance: "alta",
      previousIntervalDays: first.intervalDays,
      isFirstContact: false,
    });
    const third = calculateNextInterval({
      questionCount: 20,
      correctCount: 17,
      perceivedDifficulty: "Fácil",
      importance: "alta",
      previousIntervalDays: second.intervalDays,
      isFirstContact: false,
    });

    expect(first.intervalDays).toBe(14);
    expect(second.intervalDays).toBe(67);
    expect(third.intervalDays).toBe(180);
    expect(third.hitMaximum).toBe(true);
  });

  it("keeps an unstable high-importance topic close after performance drops", () => {
    const first = calculateNextInterval({
      questionCount: 20,
      correctCount: 11,
      perceivedDifficulty: "Médio",
      importance: "alta",
      isFirstContact: true,
    });
    const second = calculateNextInterval({
      questionCount: 20,
      correctCount: 14,
      perceivedDifficulty: "Médio",
      importance: "alta",
      previousIntervalDays: first.intervalDays,
      isFirstContact: false,
    });
    const third = calculateNextInterval({
      questionCount: 20,
      correctCount: 10,
      perceivedDifficulty: "Difícil",
      importance: "alta",
      previousIntervalDays: second.intervalDays,
      isFirstContact: false,
    });

    expect([first.intervalDays, second.intervalDays, third.intervalDays]).toEqual([10, 24, 22]);
  });

  it("lets perceived difficulty command samples below 20 questions", () => {
    const poorSmallSample = calculateNextInterval({
      questionCount: 15,
      correctCount: 7,
      perceivedDifficulty: "Difícil",
      importance: "alta",
      previousIntervalDays: 7,
      isFirstContact: false,
    });
    const rareTopicFirst = calculateNextInterval({
      questionCount: 10,
      correctCount: 9,
      perceivedDifficulty: "Muito fácil",
      importance: "baixa",
      isFirstContact: true,
    });
    const rareTopicSecond = calculateNextInterval({
      questionCount: 10,
      correctCount: 10,
      perceivedDifficulty: "Fácil",
      importance: "baixa",
      previousIntervalDays: rareTopicFirst.intervalDays,
      isFirstContact: false,
    });

    expect(poorSmallSample.calculationMode).toBe("small_sample");
    expect(poorSmallSample.intervalDays).toBe(7);
    expect(rareTopicFirst.intervalDays).toBe(21);
    expect(rareTopicSecond.intervalDays).toBe(113);
  });

  it("holds a chronically weak topic at the seven day floor", () => {
    const result = calculateNextInterval({
      questionCount: 20,
      correctCount: 8,
      perceivedDifficulty: "Muito difícil",
      importance: "media",
      previousIntervalDays: 7,
      isFirstContact: false,
    });

    expect(result.intervalDays).toBe(7);
    expect(result.hitMinimum).toBe(true);
  });

  it("keeps the calculated interval but warns when it falls after the exam", () => {
    const result = calculateNextInterval({
      questionCount: 20,
      correctCount: 20,
      perceivedDifficulty: "Muito fácil",
      importance: "baixa",
      previousIntervalDays: 180,
      isFirstContact: false,
      reviewDate: "2026-10-01",
      examDate: "2026-11-30",
    });

    expect(result.intervalDays).toBe(180);
    expect(result.nextReviewDate).toBe("2027-03-30");
    expect(result.fallsAfterExam).toBe(true);
  });

  it("freezes urgency when a topic enters the backlog", () => {
    expect(calculateUrgency({
      lastReviewDate: "2026-06-01",
      intervalDays: 14,
      asOfDate: "2026-07-11",
    })).toBeCloseTo(2.857, 3);
    expect(calculateUrgency({
      lastReviewDate: "2026-06-01",
      intervalDays: 14,
      asOfDate: "2026-08-01",
      frozenUrgency: 2.8571,
    })).toBe(2.8571);
  });

  it("orders the validated weekly priorities", () => {
    const priorities = [
      calculatePriority({ urgency: 1.4, performanceBand: "muito_ruim", importance: "alta" }),
      calculatePriority({ urgency: 1.17, performanceBand: "ruim", importance: "alta" }),
      calculatePriority({ urgency: 1.33, performanceBand: "bom", importance: "alta" }),
      calculatePriority({ urgency: 0.9, performanceBand: "bom", importance: "media" }),
      calculatePriority({ urgency: 1.25, performanceBand: "muito_bom", importance: "baixa" }),
    ];

    expect(priorities.map(value => Number(value.toFixed(2)))).toEqual([9.24, 5.97, 5.19, 2.34, 1.25]);
  });

  it("uses the target, then the closest previous study slot, then moves forward", () => {
    expect(findNearestStudySlot({
      targetDate: "2026-08-13",
      studyDays: [3, 5, 6],
      dailyCapacity: 1,
    })).toBe("2026-08-12");

    expect(findNearestStudySlot({
      targetDate: "2026-08-13",
      studyDays: [3, 5, 6],
      dailyCapacity: 1,
      occupiedDates: ["2026-08-12"],
    })).toBe("2026-08-14");

    expect(findNearestStudySlot({
      targetDate: "2026-08-13",
      studyDays: [3, 5, 6],
      dailyCapacity: 1,
      occupiedDates: ["2026-08-12", "2026-08-14"],
    })).toBe("2026-08-15");
  });

  it("never places a retroactive first contact review before today", () => {
    expect(findNearestStudySlot({
      targetDate: "2026-08-01",
      studyDays: [1, 3, 5],
      dailyCapacity: 1,
      notBeforeDate: "2026-08-07",
    })).toBe("2026-08-07");
  });

  it("keeps manual exceptions without consuming unavailable weekly slots", () => {
    const routineManual = {
      ...block("routine", "Rotina", 75, "media", "2026-06-25", 14),
      planned_review_date: "2026-08-10",
      planning_source: "manual" as const,
    };
    const aboveCapacity = {
      ...block("extra-capacity", "Extra na segunda", 75, "media", "2026-06-25", 14),
      planned_review_date: "2026-08-10",
      planning_source: "manual" as const,
    };
    const outsideRoutine = {
      ...block("outside-routine", "Extra na quinta", 75, "media", "2026-06-25", 14),
      planned_review_date: "2026-08-13",
      planning_source: "manual" as const,
    };
    const automatic = {
      ...block("automatic", "Automático", 75, "media", "2026-06-25", 14),
      next_review_date: "2026-08-11",
    };

    const plan = buildWeeklyPlan({
      blocks: [routineManual, aboveCapacity, outsideRoutine, automatic],
      studyDays: [1, 2],
      dailyCapacity: 1,
      referenceDate: "2026-08-10",
    });

    expect(plan.selected.map(item => item.block.id)).toEqual([
      "extra-capacity",
      "routine",
      "automatic",
      "outside-routine",
    ]);
    expect(plan.selected.filter(item => item.isExtra).map(item => item.block.id)).toEqual([
      "extra-capacity",
      "outside-routine",
    ]);
    expect(plan.capacityUsed).toBe(2);
    expect(plan.extraCount).toBe(2);
    expect(plan.backlog).toEqual([]);
  });

  it("respects daily slots and sends weekly overflow to a frozen backlog", () => {
    const blocks = [
      { ...block("hipo", "Hiponatremia", 40, "alta", "2026-06-28", 10), next_review_date: "2026-07-06" },
      { ...block("sepse", "Sepse", 55, "alta", "2026-06-28", 12), next_review_date: "2026-07-07" },
      { ...block("cirrose", "Cirrose", 75, "alta", "2026-06-26", 14), next_review_date: "2026-07-08" },
      { ...block("dpoc", "DPOC", 75, "media", "2026-06-30", 14), next_review_date: "2026-07-09" },
      { ...block("nefritica", "Nefrítica", 90, "baixa", "2026-06-25", 14), next_review_date: "2026-07-09" },
    ];
    const plan = buildWeeklyPlan({
      blocks,
      studyDays: [1, 2, 3, 4],
      dailyCapacity: 1,
      referenceDate: "2026-07-10",
      examDate: "2026-11-30",
    });

    expect(plan.selected).toHaveLength(4);
    expect(new Set(plan.selected.map(item => item.block.title))).toEqual(new Set([
      "Hiponatremia", "Sepse", "Cirrose", "DPOC",
    ]));
    expect(plan.selected.map(item => item.scheduledDate)).toEqual([
      "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09",
    ]);
    expect(plan.backlog.map(item => item.block.title)).toEqual(["Nefrítica"]);
    expect(plan.backlogUpdates).toHaveLength(1);
    expect(plan.backlogUpdates[0].backlog_urgency).toBeGreaterThanOrEqual(0.8);
  });

  it("places overdue topics in FIFO order before regular work and pushes overflow back", () => {
    const regular = block("regular", "Sepse", 40, "alta", "2026-06-30", 10);
    const older = {
      ...block("older", "Nefrítica", 90, "baixa", "2026-06-25", 14),
      backlog_since: "2026-07-27",
      backlog_urgency: 1.25,
    };
    const newer = {
      ...block("newer", "Cirrose", 55, "alta", "2026-06-25", 14),
      backlog_since: "2026-08-03",
      backlog_urgency: 1.25,
    };

    const plan = buildWeeklyPlan({
      blocks: [regular, newer, older],
      studyDays: [1, 2],
      dailyCapacity: 1,
      referenceDate: "2026-08-10",
    });

    expect(plan.selected.map(item => item.block.title)).toEqual(["Nefrítica", "Cirrose"]);
    expect(plan.selected.map(item => item.scheduledDate)).toEqual(["2026-08-10", "2026-08-11"]);
    expect(plan.backlog.map(item => item.block.title)).toEqual(["Sepse"]);
    expect(plan.backlogUpdates.map(item => item.id)).toEqual(["regular"]);
  });

  it("keeps automatic dates that belong to future weeks", () => {
    const future = {
      ...block("future", "Asma", 90, "media", "2026-08-10", 180),
      next_review_date: "2027-02-06",
      planned_review_date: "2027-02-05",
      planning_source: "automatic" as const,
    };

    const plan = buildWeeklyPlan({
      blocks: [future],
      studyDays: [1, 3, 5],
      dailyCapacity: 1,
      referenceDate: "2026-08-10",
    });

    expect(plan.upcoming.map(item => item.block.id)).toEqual(["future"]);
    expect(plan.scheduleUpdates).toEqual([]);
  });
});

function block(
  id: string,
  title: string,
  accuracy: number,
  importance: QuestionBlock["importance"],
  lastReviewDate: string,
  intervalDays: number,
) {
  return {
    id,
    title,
    accuracy_percentage: accuracy,
    importance,
    last_review_date: lastReviewDate,
    study_date: lastReviewDate,
    interval_days: intervalDays,
    next_review_date: "2026-07-10",
    planned_review_date: null,
    planning_source: null,
    backlog_since: null,
    backlog_urgency: null,
    pre_exam_review_requested: false,
    performance_band: classifyPerformance(accuracy),
    created_at: `${lastReviewDate}T12:00:00Z`,
  } as QuestionBlock;
}
