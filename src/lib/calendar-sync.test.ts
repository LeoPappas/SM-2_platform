import { describe, expect, it } from "vitest";
import type { QuestionBlock } from "./database.types";
import {
  calendarEventDescription,
  calendarFingerprint,
  needsCalendarReconciliation,
} from "./calendar-sync-state";

describe("durable Google Calendar reconciliation", () => {
  it("detects every calendar-relevant change after a successful sync", () => {
    const block = syncedBlock();
    block.calendar_sync_fingerprint = calendarFingerprint(block);

    expect(needsCalendarReconciliation(block)).toBe(false);
    expect(needsCalendarReconciliation({ ...block, planned_review_date: "2026-08-15" })).toBe(true);
    expect(needsCalendarReconciliation({ ...block, title: "Novo título" })).toBe(true);
    expect(needsCalendarReconciliation({ ...block, accuracy_percentage: 90 })).toBe(true);
  });

  it("repairs orphaned events even after synchronization is disabled", () => {
    const block = syncedBlock();

    expect(needsCalendarReconciliation({
      ...block,
      calendar_sync_enabled: false,
      calendar_event_id: "event-1",
    })).toBe(true);
    expect(needsCalendarReconciliation({
      ...block,
      calendar_sync_enabled: false,
      calendar_event_id: null,
    })).toBe(false);
  });

  it("describes manual, overdue and performance changes in the event", () => {
    const description = calendarEventDescription({
      ...syncedBlock(),
      planning_source: "manual",
      backlog_since: "2026-08-03",
    });

    expect(description).toContain("Data escolhida");
    expect(description).toContain("Atrasado desde");
    expect(description).toContain("16/20 (80%)");
  });
});

function syncedBlock() {
  return {
    id: "block-1",
    title: "Cardiologia",
    major_area: "Clínica Médica",
    specialty: "Cardiologia",
    source: "MetaMed",
    study_date: "2026-07-01",
    question_count: 20,
    correct_count: 16,
    accuracy_percentage: 80,
    perceived_difficulty: "Médio",
    time_spent_minutes: 30,
    importance: "alta",
    repetitions: 1,
    interval_days: 14,
    next_review_date: "2026-08-13",
    planned_review_date: "2026-08-12",
    planning_source: "automatic",
    last_review_date: "2026-07-29",
    backlog_since: null,
    pre_exam_review_requested: false,
    performance_band: "bom",
    calendar_sync_enabled: true,
    calendar_sync_status: "synced",
    calendar_sync_fingerprint: null,
    calendar_event_id: "event-1",
  } as QuestionBlock;
}
