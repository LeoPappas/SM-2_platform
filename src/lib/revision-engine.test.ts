import { describe, expect, it } from "vitest";
import type { QuestionBlock } from "./database.types";
import {
  buildWeeklyPlan,
  buildAutomaticRebalanceUpdates,
  calculateAccuracy,
  calculateNextInterval,
  calculatePriority,
  calculateUrgency,
  classifyPerformance,
  findNearestStudySlot,
  getWeekBounds,
  normalizeStudyAvailability,
  resolvePlanningWeek,
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

  it("respects daily slots and keeps this week's overflow separate from debt", () => {
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
      referenceDate: "2026-07-06",
      examDate: "2026-11-30",
    });

    expect(plan.selected).toHaveLength(4);
    expect(new Set(plan.selected.map(item => item.block.title))).toEqual(new Set([
      "Hiponatremia", "Sepse", "Cirrose", "DPOC",
    ]));
    expect(plan.selected.map(item => item.scheduledDate)).toEqual([
      "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09",
    ]);
    expect(plan.deferred.map(item => item.block.title)).toEqual(["Nefrítica"]);
    expect(plan.backlog).toEqual([]);
    expect(plan.backlogUpdates).toEqual([]);
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
    expect(plan.backlog).toEqual([]);
    expect(plan.deferred.map(item => item.block.title)).toEqual(["Sepse"]);
    expect(plan.backlogUpdates).toEqual([]);
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

  it("normalizes ISO availability and retains per-day capacities", () => {
    expect(normalizeStudyAvailability({
      studyDays: [7, 1, 1, 3, 0, 8, 2.5],
      dailyCapacity: 2,
      dailyCapacities: { "1": 4.9, "3": -1, "7": 1, "2": 5 },
    })).toEqual({
      studyDays: [1, 3, 7],
      dailyCapacity: 2,
      dailyCapacities: { "1": 4, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 1 },
    });
  });

  it("uses the configured week start without confusing it with ISO weekdays", () => {
    expect(getWeekBounds("2026-08-10", 0)).toEqual({ weekStart: "2026-08-09", weekEnd: "2026-08-15" });
    expect(getWeekBounds("2026-08-10", 3)).toEqual({ weekStart: "2026-08-05", weekEnd: "2026-08-11" });
    const plan = buildWeeklyPlan({
      blocks: [block("sunday", "Domingo", 75, "media", "2026-07-01", 14)],
      studyDays: [7], dailyCapacity: 1, referenceDate: "2026-08-09", weekStartsOn: 0,
    });
    expect(plan.weekStart).toBe("2026-08-09");
    expect(plan.selected[0].scheduledDate).toBe("2026-08-09");
  });

  it("applies different capacities to each selected day and permits a week off", () => {
    const blocks = [1, 2, 3, 4].map(id => block(String(id), `Tema ${id}`, 75, "media", "2026-07-01", 14));
    const plan = buildWeeklyPlan({
      blocks, studyDays: [1, 2], dailyCapacity: 1, dailyCapacities: { "1": 2, "2": 1 }, referenceDate: "2026-08-10",
    });
    expect(plan.capacity).toBe(3);
    expect(plan.selected.map(item => item.scheduledDate)).toEqual(["2026-08-10", "2026-08-10", "2026-08-11"]);
    expect(plan.deferred).toHaveLength(1);
    const weekOff = buildWeeklyPlan({ blocks, studyDays: [], dailyCapacity: 0, referenceDate: "2026-08-10" });
    expect(weekOff.capacity).toBe(0);
    expect(weekOff.selected).toEqual([]);
    expect(weekOff.deferred).toHaveLength(4);
    expect(weekOff.backlogUpdates).toEqual([]);
  });

  it("creates no new suggestions or schedule updates in dates before the reference", () => {
    const plan = buildWeeklyPlan({
      blocks: [block("past-due", "Vencido", 75, "media", "2026-07-01", 14)],
      studyDays: [1, 3, 5], dailyCapacity: 1, referenceDate: "2026-08-13",
    });
    expect(plan.selected[0].scheduledDate).toBe("2026-08-14");
    expect(plan.scheduleUpdates[0].planned_review_date).toBe("2026-08-14");
  });

  it("does not invent past suggestions when all routine days have elapsed", () => {
    const plan = buildWeeklyPlan({
      blocks: [block("no-slot", "Sem vaga", 75, "media", "2026-07-01", 14)],
      studyDays: [1, 2], dailyCapacity: 1, referenceDate: "2026-08-14",
    });
    expect(plan.selected).toEqual([]);
    expect(plan.deferred.map(item => item.block.id)).toEqual(["no-slot"]);
    expect(plan.scheduleUpdates).toEqual([]);
  });

  it("counts completed work, including past days, and excludes completed blocks from the queue", () => {
    const plan = buildWeeklyPlan({
      blocks: ["done", "one", "two", "three"].map(id => block(id, id, 75, "media", "2026-07-01", 14)),
      studyDays: [1, 3, 5], dailyCapacity: 1, referenceDate: "2026-08-12",
      completedWork: [{ blockId: "done", date: "2026-08-10" }], occupiedDates: ["2026-08-12"],
    });
    expect(plan.selected.map(item => item.scheduledDate)).toEqual(["2026-08-14"]);
    expect(plan.capacityUsed).toBe(3);
    expect(plan.selected.some(item => item.block.id === "done")).toBe(false);
    expect(plan.deferred).toHaveLength(2);
  });

  it("treats manual work on a completed full day as extra", () => {
    const manual = {
      ...block("manual", "Manual", 75, "media", "2026-07-01", 14),
      planned_review_date: "2026-08-10", planning_source: "manual" as const,
    };
    const plan = buildWeeklyPlan({
      blocks: [manual], studyDays: [1], dailyCapacity: 1, referenceDate: "2026-08-10", occupiedDates: ["2026-08-10"],
    });
    expect(plan.selected[0].isExtra).toBe(true);
    expect(plan.capacityUsed).toBe(1);
    expect(plan.extraCount).toBe(1);
    expect(plan.scheduleUpdates).toEqual([]);
  });

  it("preserves manual dates in other weeks even when the item has debt or high urgency", () => {
    const future = {
      ...block("manual-future", "Futuro", 40, "alta", "2026-07-01", 7),
      planned_review_date: "2026-08-24", planning_source: "manual" as const,
      backlog_since: "2026-08-03", backlog_urgency: 4,
    };
    const past = { ...future, id: "manual-past", planned_review_date: "2026-08-03" };
    const plan = buildWeeklyPlan({
      blocks: [future, past], studyDays: [1, 2], dailyCapacity: 1, referenceDate: "2026-08-10", includeAnticipations: true,
    });
    expect(plan.selected).toEqual([]);
    expect(plan.scheduleUpdates).toEqual([]);
    expect(plan.backlog.map(item => item.block.id)).toEqual(["manual-past"]);
    expect(plan.upcoming.map(item => item.block.id)).toEqual(["manual-future"]);
  });

  it("keeps a past manual date from this week pending without rewriting it", () => {
    const manual = {
      ...block("manual", "Escolha manual", 75, "media", "2026-07-01", 14),
      planned_review_date: "2026-08-10", planning_source: "manual" as const,
    };
    const plan = buildWeeklyPlan({ blocks: [manual], studyDays: [3], dailyCapacity: 1, referenceDate: "2026-08-12" });
    expect(plan.selected).toEqual([]);
    expect(plan.deferred.map(item => item.block.id)).toEqual(["manual"]);
    expect(plan.scheduleUpdates).toEqual([]);
  });

  it("allocates actual due work before higher-priority eligible anticipations", () => {
    const due = { ...block("due", "Devida", 90, "baixa", "2026-08-10", 180), next_review_date: "2026-08-11" };
    const anticipation = { ...block("early", "Antecipada", 40, "alta", "2026-07-30", 20), next_review_date: "2026-08-19" };
    const plan = buildWeeklyPlan({
      blocks: [anticipation, due], studyDays: [1], dailyCapacity: 1, referenceDate: "2026-08-10", includeAnticipations: true,
    });
    expect(plan.selected.map(item => item.block.id)).toEqual(["due"]);
    expect(plan.anticipations).toEqual([]);
    expect(plan.backlog).toEqual([]);
    expect(plan.upcoming.map(item => item.block.id)).toEqual(["early"]);
  });

  it("only anticipates eligible future work when explicitly enabled and capacity remains", () => {
    const eligible = { ...block("early", "Antecipada", 40, "alta", "2026-07-30", 20), next_review_date: "2026-08-19" };
    const ineligible = { ...block("later", "Ainda cedo", 40, "alta", "2026-08-10", 30), next_review_date: "2026-09-09" };
    const input = { blocks: [eligible, ineligible], studyDays: [1, 2], dailyCapacity: 1, referenceDate: "2026-08-10" };
    expect(buildWeeklyPlan(input).selected).toEqual([]);
    const plan = buildWeeklyPlan({ ...input, includeAnticipations: true });
    expect(plan.anticipations.map(item => item.block.id)).toEqual(["early"]);
    expect(plan.anticipations[0].isAnticipation).toBe(true);
    expect(plan.upcoming.map(item => item.block.id)).toEqual(["later"]);
    expect(plan.backlogUpdates).toEqual([]);
  });

  it("exposes only unallocated existing debt as backlog and keeps the allocated debt selected", () => {
    const debt = ["old", "new"].map((id, index) => ({
      ...block(id, id, 90, "baixa", "2026-06-01", 14), backlog_since: index ? "2026-08-03" : "2026-07-27", backlog_urgency: 1.2,
    }));
    const plan = buildWeeklyPlan({ blocks: [...debt, block("due", "Devida", 40, "alta", "2026-07-01", 7)], studyDays: [1], dailyCapacity: 1, referenceDate: "2026-08-10" });
    expect(plan.selected.map(item => item.block.id)).toEqual(["old"]);
    expect(plan.backlog.map(item => item.block.id)).toEqual(["new"]);
    expect(plan.deferred.map(item => item.block.id)).toEqual(["due"]);
    expect(plan.backlogUpdates).toEqual([]);
    expect(plan.selected[0].effectiveUrgency).toBe(1.2);
  });

  it("clears an obsolete automatic event for deferred work without creating debt", () => {
    const automatic = { ...block("automatic", "Sem vaga", 75, "media", "2026-07-01", 14), planned_review_date: "2026-08-10", planning_source: "automatic" as const };
    const plan = buildWeeklyPlan({ blocks: [automatic], studyDays: [], dailyCapacity: 0, referenceDate: "2026-08-10" });
    expect(plan.scheduleUpdates).toEqual([{ id: "automatic", planned_review_date: null, planning_source: null }]);
    expect(plan.backlogUpdates).toEqual([]);
  });

  it("uses per-day capacity in nearest-slot scheduling even when the uniform capacity is zero", () => {
    expect(findNearestStudySlot({
      targetDate: "2026-08-10", studyDays: [1, 2], dailyCapacity: 0, dailyCapacities: { "1": 2, "2": 1 }, occupiedDates: ["2026-08-10"],
    })).toBe("2026-08-10");
  });

  it("resolves future-week exceptions when looking for a slot", () => {
    expect(findNearestStudySlot({
      targetDate: "2026-08-10", notBeforeDate: "2026-08-10", studyDays: [1], dailyCapacity: 1,
      availabilityForDate: date => date < "2026-08-17"
        ? { studyDays: [], dailyCapacity: 0 }
        : { studyDays: [2], dailyCapacity: 2 },
    })).toBe("2026-08-18");
  });

  it("searches from the lower bound when the original interval is very old", () => {
    expect(findNearestStudySlot({ targetDate: "2020-01-01", notBeforeDate: "2026-08-10", studyDays: [1], dailyCapacity: 1 })).toBe("2026-08-10");
  });

  it("rebalances debt FIFO and current due work before anticipations across successive weeks", () => {
    const debt = { ...block("debt", "Dívida", 90, "baixa", "2026-06-01", 14), backlog_since: "2026-08-03", backlog_urgency: 1.2 };
    const due = { ...block("due", "Devida", 90, "baixa", "2026-08-01", 14), next_review_date: "2026-08-15" };
    const early = { ...block("early", "Elegível", 40, "alta", "2026-07-30", 20), next_review_date: "2026-08-19" };
    const plan = buildAutomaticRebalanceUpdates({
      blocks: [early, due, debt], studyDays: [1, 2], dailyCapacity: 1, referenceDate: "2026-08-10",
    });
    expect(plan.updates.find(update => update.id === "debt")?.planned_review_date).toBe("2026-08-10");
    expect(plan.updates.find(update => update.id === "due")?.planned_review_date).toBe("2026-08-11");
    expect(plan.updates.find(update => update.id === "early")?.planned_review_date).toBe("2026-08-18");
    expect(plan.unscheduledBlockIds).toEqual([]);
  });

  it("reserves every manual choice and completed slot when rebalancing", () => {
    const manual = {
      ...block("manual", "Manual", 75, "media", "2026-07-01", 14), planned_review_date: "2026-08-17", planning_source: "manual" as const,
    };
    const completed = { ...block("done", "Concluído", 75, "media", "2026-08-10", 7), next_review_date: "2026-08-17" };
    const due = block("due", "Devida", 75, "media", "2026-07-01", 14);
    const plan = buildAutomaticRebalanceUpdates({
      blocks: [manual, completed, due], studyDays: [1, 2], dailyCapacity: 1, referenceDate: "2026-08-10",
      completedWork: [{ blockId: "done", date: "2026-08-10" }],
    });
    expect(plan.updates.find(update => update.id === "due")?.planned_review_date).toBe("2026-08-11");
    expect(plan.updates.find(update => update.id === "done")?.planned_review_date).toBe("2026-08-18");
    expect(plan.updates.some(update => update.id === "manual")).toBe(false);
    expect(manual.planned_review_date).toBe("2026-08-17");
  });

  it("skips weeks off during rebalance and applies future-week capacities", () => {
    const plan = buildAutomaticRebalanceUpdates({
      blocks: ["one", "two"].map(id => block(id, id, 75, "media", "2026-07-01", 14)),
      studyDays: [1], dailyCapacity: 1, referenceDate: "2026-08-10",
      availabilityForDate: date => date < "2026-08-17"
        ? { studyDays: [], dailyCapacity: 0 }
        : { studyDays: [3], dailyCapacity: 0, dailyCapacities: { "3": 2 } },
    });
    expect(plan.updates.map(update => update.planned_review_date)).toEqual(["2026-08-19", "2026-08-19"]);
  });

  it("bounds an unavailable rebalance and clears obsolete automatic dates without touching manual or pre-exam work", () => {
    const automatic = { ...block("automatic", "Sem vaga", 75, "media", "2026-07-01", 14), planned_review_date: "2026-08-10", planning_source: "automatic" as const };
    const manual = { ...automatic, id: "manual", planning_source: "manual" as const };
    const preExam = { ...automatic, id: "pre-exam", pre_exam_review_requested: true };
    const plan = buildAutomaticRebalanceUpdates({
      blocks: [automatic, manual, preExam], studyDays: [], dailyCapacity: 0, referenceDate: "2026-08-10", maximumWeeks: 3,
    });
    expect(plan.updates).toEqual([{ id: "automatic", planned_review_date: null, planning_source: null }]);
    expect(plan.unscheduledBlockIds).toEqual(["automatic"]);
  });

  it("rebalance uses priority among due reviews and matches the current weekly plan", () => {
    const low = block("low", "Baixa", 90, "baixa", "2026-07-01", 14);
    const high = block("high", "Alta", 40, "alta", "2026-07-01", 14);
    const input = { blocks: [low, high], studyDays: [1], dailyCapacity: 1, referenceDate: "2026-08-10" };
    const weekly = buildWeeklyPlan({ ...input, includeAnticipations: true });
    const rebalance = buildAutomaticRebalanceUpdates(input);
    expect(weekly.selected[0].block.id).toBe("high");
    expect(rebalance.updates.find(update => update.id === "high")?.planned_review_date).toBe(weekly.selected[0].scheduledDate);
    expect(rebalance.updates.find(update => update.id === "low")?.planned_review_date).toBe("2026-08-17");
  });

  it("rebalances with a saved Monday current week while the profile now starts on Sunday", () => {
    const blocks = ["one", "two"].map(id => block(id, id, 75, "media", "2026-07-01", 14));
    const saved = [{ week_start: "2026-09-14", week_starts_on: 1 }];
    const plan = buildAutomaticRebalanceUpdates({
      blocks, studyDays: [1, 7], dailyCapacity: 1, referenceDate: "2026-09-20", weekStartsOn: 0,
      weekForDate: date => resolvePlanningWeek(date, 0, saved),
    });
    expect(plan.updates.map(update => update.planned_review_date)).toEqual(["2026-09-20", "2026-09-21"]);
    // Sunday is in the saved current week and must not be allocated again by the new Sunday week.
    expect(plan.unscheduledBlockIds).toEqual([]);
  });

  it("respects a differently anchored saved future week without duplicating overlapping days", () => {
    const blocks = ["one", "two", "three"].map(id => block(id, id, 75, "media", "2026-07-01", 14));
    const saved = [
      { week_start: "2026-09-14", week_starts_on: 1 },
      { week_start: "2026-09-21", week_starts_on: 1 },
      { week_start: "2026-09-27", week_starts_on: 0 },
    ];
    const plan = buildAutomaticRebalanceUpdates({
      blocks, studyDays: [7], dailyCapacity: 1, referenceDate: "2026-09-20", weekStartsOn: 0,
      weekForDate: date => resolvePlanningWeek(date, 0, saved),
    });
    expect(plan.updates.map(update => update.planned_review_date).sort()).toEqual(["2026-09-20", "2026-09-27", "2026-10-04"]);
    expect(new Set(plan.updates.map(update => update.planned_review_date)).size).toBe(3);
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
