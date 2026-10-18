import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockReview, Database, QuestionBlock, StudentProfile } from "./database.types";

const api = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("./supabase", () => ({ supabase: { from: api.from, rpc: api.rpc } }));

import { completeBlockReview, rebalanceAutomaticReviewSlots, scheduleBlockReview, setPreExamReviewRequest, unscheduleBlockReview } from "./revision-actions";
import { deleteQuestionBlock, persistAutomaticReviewSchedule, updateQuestionBlock } from "./question-block-writes";

type CompletionArgs = Database["public"]["Functions"]["complete_block_review"]["Args"];
type StoredRow = Record<string, unknown>;
let blocks: QuestionBlock[];
let profile: StudentProfile;
let savedReviews: BlockReview[];
let writeError: boolean;
let mutationNumber: number;

/** Equality predicates execute against current storage. Reads are snapshots, so a result
 * in flight cannot accidentally share row references with a later edit.
 */
function query(table: string) {
  const predicates = new Map<string, unknown>();
  let mutation: Partial<QuestionBlock> | null = null;
  let orFilter: string | null = null;
  let deleting = false;
  const execute = (single: boolean) => {
    if ((mutation || deleting) && writeError) return { data: null, error: { message: "Write failed" } };
    const source: StoredRow[] = table === "student_profiles" ? [profile as unknown as StoredRow]
      : table === "question_blocks" ? blocks as unknown as StoredRow[]
        : table === "block_reviews" ? savedReviews as unknown as StoredRow[] : [];
    const matches = source.filter(row => [...predicates].every(([key,value]) => row[key] === value)
      && (orFilter === null || matchesOr(row, orFilter)));
    if (mutation) {
      for (const row of matches) Object.assign(row, mutation, { updated_at: `version-${++mutationNumber}` });
    }
    if (deleting) for (const row of matches) source.splice(source.indexOf(row), 1);
    const snapshot = structuredClone(matches);
    return { data: single ? snapshot[0] ?? null : snapshot, error: null };
  };
  const fluent = {
    select: () => fluent,
    update: (patch: Partial<QuestionBlock>) => { mutation = patch; return fluent; },
    delete: () => { deleting = true; return fluent; },
    eq: (key: string,value: unknown) => { predicates.set(key,value); return fluent; },
    is: (key: string,value: unknown) => { predicates.set(key,value); return fluent; },
    gte: () => fluent,
    lte: () => fluent,
    or: (expression: string) => { orFilter = expression; return fluent; },
    single: () => Promise.resolve(execute(true)),
    maybeSingle: () => Promise.resolve(execute(true)),
    then: <TResult1 = ReturnType<typeof execute>, TResult2 = never>(
      fulfilled?: ((value: ReturnType<typeof execute>) => TResult1 | PromiseLike<TResult1>) | null,
      rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(execute(false)).then(fulfilled,rejected),
  };
  return fluent;
}

/** Evaluates PostgREST `column.is.null,column.eq.value` so a changed filter changes behavior. */
function matchesOr(row: StoredRow, expression: string) {
  return expression.split(",").some(clause => {
    const [column, operator, value] = clause.split(".");
    return operator === "is" && value === "null" ? row[column] === null : operator === "eq" && row[column] === value;
  });
}

function blockFixture(): QuestionBlock {
  return {
    id: "block-1", user_id: "student-1", title: "Cardiologia", area_id: null, area_name: "Clínica Médica",
    exam_target_id: null, source: "MetaMed", question_count: 20, correct_count: 12, accuracy_percentage: 60,
    perceived_difficulty: "Médio", time_spent_minutes: null, priority_weight: 2, study_date: "2026-09-01",
    repetitions: 0, easiness_factor: 2.5, interval_days: 14, next_review_date: "2026-09-15",
    major_area: "Clínica Médica", specialty: "Cardiologia", importance: "media", suggested_importance: null,
    last_review_date: "2026-09-01", planned_review_date: "2026-09-18", planning_source: "automatic",
    backlog_since: null, backlog_urgency: null, pre_exam_review_requested: false,
    performance_band: "ruim", calculation_mode: "performance", engine_version: "metamed-v1",
    catalog_item_id: null, relevance_version_id: null, relevance_score: null, relevance_factor: null,
    relevance_formula_version: null, relevance_formula_config: null, relevance_shadow_interval_days: null, archived_at: null,
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
  writeError = false;
  mutationNumber = 0;
  api.from.mockImplementation(query);
  api.rpc.mockImplementation((_name: string,args: CompletionArgs) => Promise.resolve(commit(args)));
});
afterEach(() => vi.useRealTimers());

describe("review transaction", () => {
  it("retries an uncertain committed operation and returns its original date and interval", async () => {
    const input = completionInput();
    api.rpc.mockImplementationOnce((_name: string,args: CompletionArgs) => {
      commit(args);
      return Promise.resolve({ data: null, error: { message: "Connection lost after commit" } });
    });
    await expect(completeBlockReview(input)).rejects.toThrow("mesma operação");
    expect(savedReviews).toHaveLength(1);
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
  });
});

describe("guarded block writes", () => {
  it("lets an automatic plan replace an automatic date for the same revision", async () => {
    const result = await persistAutomaticReviewSchedule({
      block: structuredClone(blocks[0]), userId: "student-1", date: "2026-09-25", source: "automatic",
    });
    expect(result.block?.planned_review_date).toBe("2026-09-25");
    expect(blocks[0].planned_review_date).toBe("2026-09-25");
  });

  it("does not let a stale automatic plan replace a manual move", async () => {
    const stale = structuredClone(blocks[0]);
    Object.assign(blocks[0], { planned_review_date: "2026-10-02", planning_source: "manual" });
    const result = await persistAutomaticReviewSchedule({ block: stale, userId: "student-1", date: "2026-09-25", source: "automatic" });
    expect(result.block).toBeNull();
    expect(blocks[0].planned_review_date).toBe("2026-10-02");
    expect(blocks[0].planning_source).toBe("manual");
  });

  it("never deletes a block that belongs to another student", async () => {
    await deleteQuestionBlock({ block: blocks[0], userId: "another-student" });
    expect(blocks).toHaveLength(1);
    await deleteQuestionBlock({ block: blocks[0], userId: "student-1" });
    expect(blocks).toHaveLength(0);
  });

  it("does not let an automatic plan computed for an older revision replace the newer schedule", async () => {
    const stale = structuredClone(blocks[0]);
    Object.assign(blocks[0], { repetitions: 1, planned_review_date: "2026-10-02" });
    const result = await persistAutomaticReviewSchedule({ block: stale, userId: "student-1", date: "2026-09-25", source: "automatic" });
    expect(result.block).toBeNull();
    expect(blocks[0].planned_review_date).toBe("2026-10-02");
  });

  it("replaces a schedule that has no source yet", async () => {
    blocks[0].planning_source = null;
    const result = await persistAutomaticReviewSchedule({ block: structuredClone(blocks[0]), userId: "student-1", date: "2026-09-25", source: "automatic" });
    expect(result.block?.planned_review_date).toBe("2026-09-25");
  });

  it("never updates a block that belongs to another student", async () => {
    await expect(updateQuestionBlock({ blockId: "block-1", userId: "another-student", changes: { title: "Hijack" } }))
      .rejects.toThrow("outra sessão");
    expect(blocks[0].title).toBe("Cardiologia");
  });

  it("reports storage failures instead of pretending the write happened", async () => {
    writeError = true;
    await expect(updateQuestionBlock({ blockId: "block-1", userId: "student-1", changes: { title: "x" } }))
      .rejects.toThrow("Não foi possível atualizar o tema.");
    await expect(persistAutomaticReviewSchedule({ block: blocks[0], userId: "student-1", date: "2026-09-25", source: "automatic" }))
      .rejects.toThrow("confirmar todas as datas");
    await expect(deleteQuestionBlock({ block: blocks[0], userId: "student-1" }))
      .rejects.toThrow("Não foi possível excluir o tema.");
    expect(blocks).toHaveLength(1);
  });
});

describe("scheduling actions", () => {
  it("stores a manual choice with the chosen date", async () => {
    await scheduleBlockReview({ block: structuredClone(blocks[0]), userId: "student-1", date: "2026-09-24" });
    expect(blocks[0]).toMatchObject({ planned_review_date: "2026-09-24", planning_source: "manual" });
  });

  it("returns to the automatic suggestion from the nearest free slot", async () => {
    Object.assign(blocks[0], { planning_source: "manual", planned_review_date: "2026-10-30" });
    await unscheduleBlockReview({ block: structuredClone(blocks[0]), userId: "student-1" });
    expect(blocks[0]).toMatchObject({ planned_review_date: "2026-09-18", planning_source: "automatic" });
  });

  it("rejects an unschedule made from an older revision", async () => {
    const stale = structuredClone(blocks[0]);
    Object.assign(blocks[0], { repetitions: 1, planning_source: "manual", planned_review_date: "2026-10-30" });
    await expect(unscheduleBlockReview({ block: stale, userId: "student-1" })).rejects.toThrow("outra sessão");
    expect(blocks[0]).toMatchObject({ planned_review_date: "2026-10-30", planning_source: "manual" });
  });

  it("persists the pre-exam decision in both directions", async () => {
    await setPreExamReviewRequest({ blockId: "block-1", userId: "student-1", requested: true });
    expect(blocks[0].pre_exam_review_requested).toBe(true);
    await setPreExamReviewRequest({ blockId: "block-1", userId: "student-1", requested: false });
    expect(blocks[0].pre_exam_review_requested).toBe(false);
  });

  it("counts only the schedules that were actually rewritten when rebalancing", async () => {
    blocks[0].planned_review_date = null;
    let raced = false;
    api.from.mockImplementation((table: string) => {
      const fluent = query(table);
      const update = fluent.update;
      fluent.update = (patch: Partial<QuestionBlock>) => {
        // The student moves the block by hand after the plan was computed but before it is saved.
        if (table === "question_blocks" && !raced) {
          raced = true;
          Object.assign(blocks[0], { planning_source: "manual", planned_review_date: "2026-10-30" });
        }
        return update(patch);
      };
      return fluent;
    });
    const result = await rebalanceAutomaticReviewSlots({
      userId: "student-1", studyDays: [1, 2, 3, 4, 5, 6, 7], dailyCapacity: 1, weekStartsOn: 1, timezone: "America/Sao_Paulo",
    });
    expect(blocks[0]).toMatchObject({ planned_review_date: "2026-10-30", planning_source: "manual" });
    expect(result.updated).toBe(0);
  });
});
