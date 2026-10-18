import { describe, expect, it } from "vitest";
import { availabilityResolver, firstStudyDayOfWeek } from "./study-availability";
import { availabilityPrompt } from "./week-confirmation";

// Week of Monday 2026-10-12 to Sunday 2026-10-18.
const base = { currentWeekStart: "2026-10-12", profileCreatedAt: "2026-09-01T12:00:00Z" };

describe("start-of-week availability prompt", () => {
  it("asks about the current week until the student answers", () => {
    expect(availabilityPrompt({ ...base, today: "2026-10-13", weeks: [] })).toEqual({ weekStart: "2026-10-12", scope: "current" });
    expect(availabilityPrompt({ ...base, today: "2026-10-13", weeks: [{ week_start: "2026-10-12", availability_confirmed_at: "2026-10-12T10:00:00Z" }] })).toBeNull();
  });

  it("asks about the next week in its last two days", () => {
    expect(availabilityPrompt({ ...base, today: "2026-10-17", weeks: [{ week_start: "2026-10-12", availability_confirmed_at: "x" }] }))
      .toEqual({ weekStart: "2026-10-19", scope: "next" });
    expect(availabilityPrompt({ ...base, today: "2026-10-16", weeks: [{ week_start: "2026-10-12", availability_confirmed_at: "x" }] })).toBeNull();
    expect(availabilityPrompt({ ...base, today: "2026-10-18", weeks: [
      { week_start: "2026-10-12", availability_confirmed_at: "x" },
      { week_start: "2026-10-19", availability_confirmed_at: "y" },
    ] })).toBeNull();
  });

  it("does not ask a student who set up the routine this week", () => {
    expect(availabilityPrompt({ ...base, today: "2026-10-14", weeks: [], profileCreatedAt: "2026-10-13T15:00:00Z" })).toBeNull();
  });
});

describe("availability of a given day", () => {
  const routine = { study_days: [1, 3, 5], daily_theme_capacity: 2, week_starts_on: 1 };

  it("uses the week's adjustment over the routine", () => {
    const capacityOn = availabilityResolver(routine, [{ week_start: "2026-10-19", study_days: [2], daily_capacities: { 2: 4 } }]);
    expect(capacityOn("2026-10-14").dailyCapacities["3"]).toBe(2);
    expect(capacityOn("2026-10-21").dailyCapacities["3"]).toBe(0);
    expect(capacityOn("2026-10-20").dailyCapacities["2"]).toBe(4);
  });

  it("finds the first day with room in a week", () => {
    expect(firstStudyDayOfWeek("2026-10-19", { studyDays: [3, 5], dailyCapacity: 1 })).toBe("2026-10-21");
    expect(firstStudyDayOfWeek("2026-10-19", { studyDays: [], dailyCapacity: 1 })).toBe("2026-10-19");
  });
});
