import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockReview, Database, QuestionBlock, StudentProfile } from "./database.types";

const api = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
vi.mock("./supabase", () => ({ supabase: { from: api.from, rpc: api.rpc } }));
vi.mock("./calendar-auth", () => ({
  createOrUpdateCalendarEventWithAuth: api.createEvent,
  deleteCalendarEventWithAuth: api.deleteEvent,
}));

import { completeBlockReview, scheduleBlockReview } from "./revision-actions";
import { reconcileQuestionBlocksCalendar, syncQuestionBlockCalendar } from "./calendar-sync";

type CompletionArgs = Database["public"]["Functions"]["complete_block_review"]["Args"];
type StoredRow = Record<string, unknown>;
let blocks: QuestionBlock[];
let profile: StudentProfile;
let savedReviews: BlockReview[];
let readError: string | null;
let mutationNumber: number;

/** Equality predicates execute against current storage. Reads are snapshots, allowing a
 * Calendar request to race with a later edit without accidentally sharing row references.
 */
function query(table: string) {
  const predicates = new Map<string, unknown>();
  let mutation: Partial<QuestionBlock> | null = null;
  let automaticOnly = false;
  const execute = (single: boolean) => {
    if (!mutation && readError === table) return { data: null, error: { message: "Read failed" } };
    const source: StoredRow[] = table === "student_profiles" ? [profile as unknown as StoredRow]
      : table === "question_blocks" ? blocks as unknown as StoredRow[]
        : table === "block_reviews" ? savedReviews as unknown as StoredRow[] : [];
    const matches = source.filter(row => [...predicates].every(([key,value]) => row[key] === value)
      && (!automaticOnly || row.planning_source === null || row.planning_source === "automatic"));
    if (mutation) {
      for (const row of matches) Object.assign(row, mutation, { updated_at: `version-${++mutationNumber}` });
    }
    const snapshot = structuredClone(matches);
    return { data: single ? snapshot[0] ?? null : snapshot, error: null };
  };
  const fluent = {
    select: () => fluent,
    update: (patch: Partial<QuestionBlock>) => { mutation = patch; return fluent; },
    eq: (key: string,value: unknown) => { predicates.set(key,value); return fluent; },
    or: () => { automaticOnly = true; return fluent; },
    single: () => Promise.resolve(execute(true)),
    maybeSingle: () => Promise.resolve(execute(true)),
    then: <TResult1 = ReturnType<typeof execute>, TResult2 = never>(
      fulfilled?: ((value: ReturnType<typeof execute>) => TResult1 | PromiseLike<TResult1>) | null,
      rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(execute(false)).then(fulfilled,rejected),
  };
  return fluent;
}

function blockFixture(): QuestionBlock {
  return {
    id: "block-1", user_id: "student-1", title: "Cardiologia", area_id: null, area_name: "Clínica Médica",
    exam_target_id: null, source: "MetaMed", question_count: 20, correct_count: 12, accuracy_percentage: 60,
    perceived_difficulty: "Médio", time_spent_minutes: null, priority_weight: 2, study_date: "2026-09-01",
    repetitions: 0, easiness_factor: 2.5, interval_days: 14, next_review_date: "2026-09-15",
    calendar_event_id: null, calendar_sync_enabled: true, calendar_sync_status: "pending",
    calendar_last_error: null, calendar_last_synced_at: null, calendar_sync_fingerprint: null,
    major_area: "Clínica Médica", specialty: "Cardiologia", importance: "media", suggested_importance: null,
    last_review_date: "2026-09-01", planned_review_date: "2026-09-18", planning_source: "automatic",
    backlog_since: null, backlog_urgency: null, pre_exam_review_requested: false,
    performance_band: "ruim", calculation_mode: "performance", engine_version: "metamed-v1",
    catalog_item_id: null, relevance_version_id: null, relevance_score: null, relevance_factor: null,
    relevance_formula_version: null, relevance_formula_config: null, relevance_shadow_interval_days: null,
    created_at: "2026-09-01T15:00:00Z", updated_at: "version-0",
  };
}

function commit(args: CompletionArgs) {
  const previous = savedReviews.find(review => review.operation_id === args.p_operation_id);
  if (previous) return { data: { block: structuredClone(blocks[0]), review: structuredClone(previous), replayed: true }, error: null };
  const review = {
    ...args.p_review, id: `review-${savedReviews.length+1}`, block_id: args.p_block_id, user_id: "student-1",
    operation_id: args.p_operation_id, new_interval_days: args.p_changes.interval_days, created_at: "2026-09-18T15:00:00Z",
  } as BlockReview;
  savedReviews.push(review);
  Object.assign(blocks[0],args.p_changes,{ repetitions: blocks[0].repetitions+1, updated_at: `version-${++mutationNumber}` });
  return { data: { block: structuredClone(blocks[0]), review: structuredClone(review), replayed: false }, error: null };
}

function completionInput(block = structuredClone(blocks[0])) {
  return {
    block, userId: "student-1", reviewDate: "2026-09-18", questionCount: 20, correctCount: 18,
    perceivedDifficulty: "Médio" as const, operationId: "persistent-operation-1",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-18T15:00:00Z"));
  vi.clearAllMocks();
  blocks = [blockFixture()];
  profile = { user_id: "student-1", study_days: [1,2,3,4,5,6,7], daily_theme_capacity: 1,
    timezone: "America/Sao_Paulo", week_starts_on: 1 } as StudentProfile;
  savedReviews = [];
  readError = null;
  mutationNumber = 0;
  api.from.mockImplementation(query);
  api.rpc.mockImplementation((_name: string,args: CompletionArgs) => Promise.resolve(commit(args)));
  api.createEvent.mockResolvedValue({ ok: true, eventId: "calendar-event-1", status: "synced" });
  api.deleteEvent.mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe("review transaction and external Calendar boundary", () => {
  it("retries an uncertain committed operation and returns its original date and interval", async () => {
    const input = completionInput();
    api.rpc.mockImplementationOnce((_name: string,args: CompletionArgs) => {
      commit(args);
      return Promise.resolve({ data: null, error: { message: "Connection lost after commit" } });
    });
    await expect(completeBlockReview(input)).rejects.toThrow("mesma operação");
    expect(savedReviews).toHaveLength(1);
    expect(api.createEvent).not.toHaveBeenCalled();
    const original = structuredClone(savedReviews[0]);
    // A changed form or changed availability must not make replay display a new calculation.
    const result = await completeBlockReview({ ...input, correctCount: 2 });
    expect(api.rpc.mock.calls.map(call => (call[1] as CompletionArgs).p_operation_id))
      .toEqual([input.operationId,input.operationId]);
    expect(savedReviews).toHaveLength(1);
    expect(blocks[0].repetitions).toBe(1);
    expect(result.calculation.nextReviewDate).toBe(original.new_next_review_date);
    expect(result.calculation.intervalDays).toBe(original.new_interval_days);
    expect(result.calculation.accuracy).toBe(original.accuracy_percentage);
    expect(api.createEvent).toHaveBeenCalledWith(expect.objectContaining({ date: blocks[0].planned_review_date }));
  });

  it("reports an unexpected Calendar failure after commit without losing the saved study", async () => {
    api.createEvent.mockRejectedValueOnce(new Error("Calendar connection lost"));
    const result = await completeBlockReview(completionInput());
    expect(savedReviews).toHaveLength(1);
    expect(blocks[0].repetitions).toBe(1);
    expect(blocks[0].calendar_sync_status).toBe("pending");
    expect(result.calculation.nextReviewDate).toBe(savedReviews[0].new_next_review_date);
    expect(result.calendarError).toBe("Calendar connection lost");
  });

  it("leaves numeric relevance snapshots for the database activation policy to derive", async () => {
    blocks[0] = {
      ...blockFixture(),
      catalog_item_id: "catalog-item-1",
      relevance_version_id: "relevance-version-1",
      relevance_score: 9,
    };

    const result = await completeBlockReview(completionInput(blocks[0]));

    expect(result.calculation.intervalDays).toBe(84);
    expect(savedReviews[0].new_interval_days).toBe(84);
    const submittedReview = (api.rpc.mock.calls[0][1] as CompletionArgs).p_review;
    expect(submittedReview).not.toHaveProperty("relevance_factor");
    expect(submittedReview).not.toHaveProperty("relevance_formula_version");
    expect(submittedReview).not.toHaveProperty("relevance_formula_config");
    expect(submittedReview).not.toHaveProperty("relevance_shadow_interval_days");
  });

  it("rejects a manual move made from an older revision without changing the newer schedule", async () => {
    const stale = structuredClone(blocks[0]);
    blocks[0].repetitions = 1;
    blocks[0].planned_review_date = "2026-10-01";
    await expect(scheduleBlockReview({ block: stale, userId: "student-1", date: "2026-09-21" }))
      .rejects.toThrow("outra sessão");
    expect(blocks[0].planned_review_date).toBe("2026-10-01");
    expect(blocks[0].repetitions).toBe(1);
    expect(api.createEvent).not.toHaveBeenCalled();
  });
});

describe("Calendar state concurrency", () => {
  it("does not let a result in flight overwrite a newer date or disabled preference", async () => {
    api.createEvent.mockImplementationOnce(async () => {
      // Another session changes scheduling while the first external request is in flight.
      Object.assign(blocks[0],{ planned_review_date: "2026-10-02", calendar_sync_enabled: false,
        calendar_sync_status: "pending", updated_at: "version-new-session" });
      return { ok: true, eventId: "outdated-calendar-event", status: "synced" };
    });
    const result = await syncQuestionBlockCalendar({ blockId: "block-1", userId: "student-1" });
    expect(result.ok).toBe(false);
    expect(blocks[0].planned_review_date).toBe("2026-10-02");
    expect(blocks[0].calendar_sync_enabled).toBe(false);
    expect(blocks[0].calendar_sync_status).toBe("pending");
    expect(blocks[0].calendar_event_id).toBeNull();
    expect(blocks[0].updated_at).toBe("version-new-session");
    expect(api.createEvent).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-18" }));
  });

  it("surfaces reconciliation read failures instead of reporting no pending events", async () => {
    readError = "question_blocks";
    await expect(reconcileQuestionBlocksCalendar("student-1")).rejects.toThrow("consultar os agendamentos pendentes");
    expect(api.createEvent).not.toHaveBeenCalled();
  });
});
