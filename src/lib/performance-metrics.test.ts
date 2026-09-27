import { describe, expect, it } from "vitest";
import { buildWeeklyPerformanceTrend, questionWeightedAccuracy, todayInTimezone } from "./performance-metrics";

describe("question-weighted performance", () => {
  it("weights by questions instead of averaging percentages", () => {
    expect(questionWeightedAccuracy([
      { question_count: 2, correct_count: 2 },
      { question_count: 98, correct_count: 49 },
    ])).toEqual({ accuracy: 51, questionCount: 100, correctCount: 51, sampleCount: 2 });
  });

  it("distinguishes a missing sample from measured zero accuracy", () => {
    expect(questionWeightedAccuracy([{ question_count: 0, correct_count: 0 }]).accuracy).toBeNull();
    expect(questionWeightedAccuracy([{ question_count: 20, correct_count: 0 }]).accuracy).toBe(0);
    expect(questionWeightedAccuracy([]).accuracy).toBeNull();
  });

  it("excludes invalid samples rather than inventing a denominator", () => {
    expect(questionWeightedAccuracy([
      { question_count: 0, correct_count: 3 },
      { question_count: 10, correct_count: 11 },
      { question_count: 20, correct_count: 10 },
    ])).toEqual({ accuracy: 50, questionCount: 20, correctCount: 10, sampleCount: 1 });
  });

  it("groups reviews using the chosen week boundary and keeps empty weeks unmeasured", () => {
    const reviews = [
      { review_date: "2026-09-15", question_count: 2, correct_count: 2 },
      { review_date: "2026-09-16", question_count: 98, correct_count: 49 },
    ];
    const monday = buildWeeklyPerformanceTrend({ reviews, referenceDate: "2026-09-18", weekStartsOn: 1 });
    expect(monday.at(-1)).toMatchObject({ key: "2026-09-14", average: 51, count: 2 });
    const wednesday = buildWeeklyPerformanceTrend({ reviews, referenceDate: "2026-09-18", weekStartsOn: 3 });
    expect(wednesday.at(-1)).toMatchObject({ key: "2026-09-16", average: 50, count: 1 });
    expect(wednesday.at(-2)).toMatchObject({ key: "2026-09-09", average: 100, count: 1 });
    expect(wednesday[0].average).toBeNull();
  });

  it("uses the student's calendar day near midnight", () => {
    const now = new Date("2026-09-19T01:00:00Z");
    expect(todayInTimezone("America/Sao_Paulo", now)).toBe("2026-09-18");
    expect(todayInTimezone("Europe/London", now)).toBe("2026-09-19");
    expect(todayInTimezone("invalid/timezone", now)).toBe("2026-09-18");
  });
});
