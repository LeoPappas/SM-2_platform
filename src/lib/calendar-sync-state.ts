import type { QuestionBlock } from "./database.types";

export function calendarFingerprint(block: QuestionBlock) {
  return JSON.stringify({
    title: block.title,
    area: block.major_area,
    specialty: block.specialty,
    source: block.source,
    studyDate: block.study_date,
    questions: block.question_count,
    correct: block.correct_count,
    accuracy: block.accuracy_percentage,
    difficulty: block.perceived_difficulty,
    minutes: block.time_spent_minutes,
    importance: block.importance,
    repetitions: block.repetitions,
    interval: block.interval_days,
    nextReview: block.next_review_date,
    plannedReview: block.planned_review_date,
    planningSource: block.planning_source,
    lastReview: block.last_review_date,
    backlogSince: block.backlog_since,
    preExam: block.pre_exam_review_requested,
    performance: block.performance_band,
  });
}

export function calendarEventDescription(block: QuestionBlock) {
  const scheduleKind = block.planning_source === "manual" ? "Data escolhida" : "Sugestão automática";
  return [
    `${block.major_area} · ${block.specialty}`,
    `${scheduleKind}: ${formatDate(block.planned_review_date)}.`,
    `Janela calculada: ${formatDate(block.next_review_date)}.`,
    `Último contato: ${formatDate(block.last_review_date ?? block.study_date)}.`,
    `Desempenho: ${block.correct_count}/${block.question_count} (${block.accuracy_percentage}%).`,
    block.backlog_since ? `Atrasado desde ${formatDate(block.backlog_since)}.` : null,
    block.source ? `Fonte: ${block.source}.` : null,
  ].filter(Boolean).join("\n");
}

export function needsCalendarReconciliation(block: QuestionBlock) {
  if (!block.calendar_sync_enabled) return Boolean(block.calendar_event_id);
  return block.calendar_sync_status !== "synced"
    || block.calendar_sync_fingerprint !== calendarFingerprint(block);
}

function formatDate(value: string | null) {
  if (!value) return "sem data";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}
