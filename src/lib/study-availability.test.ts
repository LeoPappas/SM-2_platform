import { describe, expect, it } from "vitest";
import { resolvePlanningWeek } from "./study-availability";

describe("saved planning week anchors", () => {
  it("preserves an open Monday week after the preference changes to Sunday", () => {
    expect(resolvePlanningWeek("2026-09-20", 0, [
      { week_start: "2026-09-14", week_starts_on: 1 },
    ])).toEqual({ weekStart: "2026-09-14", weekEnd: "2026-09-20", weekStartsOn: 1 });
  });

  it("respects an already saved future Sunday week after the preference changes to Monday", () => {
    expect(resolvePlanningWeek("2026-09-28", 1, [
      { week_start: "2026-09-27", week_starts_on: 0 },
    ])).toEqual({ weekStart: "2026-09-27", weekEnd: "2026-10-03", weekStartsOn: 0 });
  });

  it("chooses the latest overlapping saved anchor exactly like the SQL helper", () => {
    expect(resolvePlanningWeek("2026-09-22", 0, [
      { week_start: "2026-09-21", week_starts_on: 1 },
      { week_start: "2026-09-20", week_starts_on: 0 },
    ])).toEqual({ weekStart: "2026-09-21", weekEnd: "2026-09-27", weekStartsOn: 1 });
  });

  it("falls back to the new preference when the date has no saved week", () => {
    expect(resolvePlanningWeek("2026-09-28", 0, [
      { week_start: "2026-09-14", week_starts_on: 1 },
    ])).toEqual({ weekStart: "2026-09-27", weekEnd: "2026-10-03", weekStartsOn: 0 });
  });

  it("uses the actual saved anchor when legacy snapshot metadata is absent or inconsistent", () => {
    expect(resolvePlanningWeek("2026-09-22", 0, [{ week_start: "2026-09-21" }]).weekStartsOn).toBe(1);
    expect(resolvePlanningWeek("2026-09-22", 0, [{ week_start: "2026-09-21", week_starts_on: 0 }]).weekStartsOn).toBe(1);
  });
});
