import type { DailyCapacities, Database, StudentProfile, WeeklyPlan, WeeklyPlanItem } from "./database.types";
import { supabase } from "./supabase";
export { planningToday } from "./planning-date";
import { planningToday } from "./planning-date";

export type WeeklyPlanningData = {
  profile: StudentProfile;
  plans: WeeklyPlan[];
  overrides: WeeklyPlan[];
  items: WeeklyPlanItem[];
};

const migrationMessage = "O planejamento semanal está temporariamente indisponível. Tente novamente mais tarde.";

function planningError(error: { code?: string; message: string }, fallback: string) {
  const missingSchema = ["PGRST202", "PGRST204", "42P01", "42703", "42883"].includes(error.code ?? "");
  return new Error(missingSchema ? migrationMessage : fallback);
}

export async function prepareWeeklyPlanning(referenceDate = planningToday()) {
  const { data, error } = await supabase.rpc("prepare_weekly_plan", { p_reference_date: referenceDate });
  if (error) throw planningError(error, "Não foi possível preparar sua semana.");
  return data;
}

export async function loadWeeklyPlanning(userId: string): Promise<WeeklyPlanningData> {
  const [profileResult, plansResult, itemsResult] = await Promise.all([
    supabase.from("student_profiles").select("*").eq("user_id", userId).single(),
    supabase.from("weekly_plans").select("*").eq("user_id", userId).order("week_start"),
    supabase.from("weekly_plan_items").select("*").eq("user_id", userId).eq("status", "open").order("due_week_start"),
  ]);
  for (const result of [profileResult, plansResult, itemsResult]) {
    if (result.error) throw planningError(result.error, "Não foi possível carregar o planejamento semanal.");
  }
  if (!profileResult.data) throw new Error("Seu perfil de estudo não foi encontrado.");
  const plans = plansResult.data ?? [];
  return { profile: profileResult.data, plans, overrides: plans.filter(plan => (plan.study_days !== null && plan.study_days !== undefined) || plan.daily_capacities != null), items: itemsResult.data ?? [] };
}

export async function saveWeeklyAvailability({ weekStart, studyDays, dailyCapacities = null }: {
  weekStart: string;
  studyDays: number[];
  dailyCapacities?: DailyCapacities | null;
}) {
  const { data, error } = await supabase.rpc("save_weekly_availability", { p_week_start: weekStart, p_study_days: studyDays, p_daily_capacities: dailyCapacities });
  if (error) throw planningError(error, "Não foi possível salvar os ajustes desta semana.");
  return data;
}

export async function resetWeeklyAvailability(weekStart: string) {
  const { data, error } = await supabase.rpc("reset_weekly_availability", { p_week_start: weekStart });
  if (error) throw planningError(error, "Não foi possível restaurar seu padrão habitual.");
  return data;
}

export async function completeReviewTransaction(args: Database["public"]["Functions"]["complete_block_review"]["Args"]) {
  const { data, error } = await supabase.rpc("complete_block_review", args);
  if (error) throw planningError(error, "Não foi possível concluir a revisão.");
  return data;
}

/** Supplies the current occurrence debt/original due week to the existing scheduling engine. */
export function summarizeOccurrences(items: WeeklyPlanItem[]) {
  return new Map(items.filter(item => item.status === "open").map(item => [item.block_id, {
    revisionNumber: item.revision_number,
    dueWeekStart: item.due_week_start,
    backlogSince: item.backlog_since,
    plannedReviewDate: item.planned_review_date,
  }]));
}
