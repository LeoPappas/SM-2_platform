import type { QuestionBlock } from "@/lib/database.types";

export function questionBlockFixture(overrides: Partial<QuestionBlock> = {}): QuestionBlock {
  return {
    id: "block-1", user_id: "student-1", title: "Insuficiência cardíaca", area_id: null, area_name: "Cardiologia",
    exam_target_id: null, source: "MetaMed", question_count: 20, correct_count: 12, accuracy_percentage: 60,
    perceived_difficulty: "Médio", time_spent_minutes: null, priority_weight: 2, study_date: "2026-09-01",
    repetitions: 1, easiness_factor: 2.5, interval_days: 14, next_review_date: "2026-10-14",
    major_area: "Clínica Médica", specialty: "Cardiologia", importance: "media", suggested_importance: null,
    last_review_date: "2026-09-30", planned_review_date: "2026-10-15", planning_source: "automatic",
    backlog_since: null, backlog_urgency: null, pre_exam_review_requested: false,
    performance_band: "ruim", calculation_mode: "performance", engine_version: "metamed-v1",
    catalog_item_id: null, relevance_version_id: null, relevance_score: null, relevance_factor: null,
    relevance_formula_version: null, relevance_formula_config: null, relevance_shadow_interval_days: null, archived_at: null, canonical_topic_id: null, engine_relevance: 5.5,
    created_at: "2026-09-01T15:00:00Z", updated_at: "version-0",
    ...overrides,
  };
}
