import { addDays, differenceInCalendarDays, format } from "date-fns";
import { planningToday } from "./planning-date";

export type AvailabilityPrompt = { weekStart: string; scope: "current" | "next" };

type ConfirmableWeek = { week_start: string; availability_confirmed_at?: string | null };

const NEXT_WEEK_NOTICE_DAYS = 2;

/**
 * Which week to ask about on the home page: the next week during the last two
 * days before it starts, otherwise the current week until it is answered. A
 * student who set up the routine during the current week is not asked again.
 */
export function availabilityPrompt({
  today,
  currentWeekStart,
  weeks,
  profileCreatedAt,
  timezone,
}: {
  today: string;
  currentWeekStart: string;
  weeks: ConfirmableWeek[];
  profileCreatedAt?: string | null;
  timezone?: string;
}): AvailabilityPrompt | null {
  const nextWeekStart = shiftDate(currentWeekStart, 7);
  const confirmed = (weekStart: string) => Boolean(weeks.find(week => week.week_start === weekStart)?.availability_confirmed_at);
  const daysUntilNextWeek = differenceInCalendarDays(parseDate(nextWeekStart), parseDate(today));
  if (daysUntilNextWeek <= NEXT_WEEK_NOTICE_DAYS && !confirmed(nextWeekStart)) {
    return { weekStart: nextWeekStart, scope: "next" };
  }
  const joinedThisWeek = Boolean(profileCreatedAt)
    && planningToday(timezone, new Date(profileCreatedAt!)) >= currentWeekStart;
  if (!confirmed(currentWeekStart) && !joinedThisWeek) return { weekStart: currentWeekStart, scope: "current" };
  return null;
}

function shiftDate(date: string, days: number) {
  return format(addDays(parseDate(date), days), "yyyy-MM-dd");
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}
