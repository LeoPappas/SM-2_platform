import { addDays, format, getDay, getISODay, startOfWeek } from "date-fns";

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SavedPlanningWeek = { week_start: string; week_starts_on?: number | null };
export type PlanningWeek = { weekStart: string; weekEnd: string; weekStartsOn: WeekStartsOn };

export type StudyAvailabilityInput = {
  studyDays: number[];
  dailyCapacity: number;
  /** Per-day capacities use ISO weekdays: Monday=1, Sunday=7. */
  dailyCapacities?: Record<string, number> | null;
};

export type StudyAvailability = {
  studyDays: number[];
  dailyCapacity: number;
  dailyCapacities: Record<string, number>;
};

/** Keeps persisted availability deterministic and safe to use as a slot count. */
export function normalizeStudyAvailability(input: StudyAvailabilityInput): StudyAvailability {
  const dailyCapacity = normalizeCapacity(input.dailyCapacity);
  const studyDays = [...new Set(input.studyDays.filter(day => Number.isInteger(day) && day >= 1 && day <= 7))]
    .sort((a, b) => a - b);
  const dailyCapacities: Record<string, number> = {};
  for (let day = 1; day <= 7; day += 1) {
    dailyCapacities[String(day)] = studyDays.includes(day)
      ? normalizeCapacity(input.dailyCapacities?.[String(day)] ?? dailyCapacity)
      : 0;
  }
  return { studyDays, dailyCapacity, dailyCapacities };
}

export function getWeekBounds(referenceDate: string, weekStartsOn: number = 1) {
  const normalizedStart = Number.isInteger(weekStartsOn) && weekStartsOn >= 0 && weekStartsOn <= 6
    ? weekStartsOn as WeekStartsOn
    : 1;
  const start = startOfWeek(parseStudyDate(referenceDate), { weekStartsOn: normalizedStart });
  return {
    weekStart: format(start, "yyyy-MM-dd"),
    weekEnd: format(addDays(start, 6), "yyyy-MM-dd"),
  };
}

/** Matches planning_week_start: the latest saved anchor covering this date wins. */
export function resolvePlanningWeek(
  date: string,
  defaultStart: number,
  savedWeeks: SavedPlanningWeek[] = [],
): PlanningWeek {
  const saved = savedWeeks
    .filter(week => date >= week.week_start
      && date <= format(addDays(parseStudyDate(week.week_start), 6), "yyyy-MM-dd"))
    .sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
  const weekStart = saved?.week_start ?? getWeekBounds(date, defaultStart).weekStart;
  return {
    weekStart,
    weekEnd: format(addDays(parseStudyDate(weekStart), 6), "yyyy-MM-dd"),
    // The persisted anchor is authoritative, including legacy rows without a snapshot.
    weekStartsOn: getDay(parseStudyDate(weekStart)) as WeekStartsOn,
  };
}

export function studyCapacityForDate(date: string, availability: StudyAvailabilityInput) {
  const normalized = normalizeStudyAvailability(availability);
  return normalized.dailyCapacities[String(getISODay(parseStudyDate(date)))];
}

export function buildStudyWeekSlots(weekStart: string, availability: StudyAvailabilityInput) {
  const normalized = normalizeStudyAvailability(availability);
  const slots: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(parseStudyDate(weekStart), offset);
    const capacity = normalized.dailyCapacities[String(getISODay(date))];
    const value = format(date, "yyyy-MM-dd");
    for (let slot = 0; slot < capacity; slot += 1) slots.push(value);
  }
  return slots;
}

function normalizeCapacity(capacity: number) {
  return Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0;
}

function parseStudyDate(value: string) {
  return new Date(`${value}T12:00:00`);
}
