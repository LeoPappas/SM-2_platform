import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { questionBlockFixture } from "@/components/test-fixtures";

const calls = vi.hoisted(() => ({ updates: [] as Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }>, error: null as null | { message: string } }));

vi.mock("./supabase", () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        calls.updates.push({ patch, filters });
        const chain = {
          eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
          then: (resolve: (value: { error: typeof calls.error }) => unknown) => Promise.resolve({ error: calls.error }).then(resolve),
        };
        return chain;
      },
    }),
  },
}));

import { setQuestionBlockArchived } from "./question-block-writes";

beforeEach(() => {
  calls.updates.length = 0;
  calls.error = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("archiving a topic", () => {
  it("stamps the archive time on the owner's topic and clears it on restore", async () => {
    const block = questionBlockFixture();
    await setQuestionBlockArchived({ block, userId: "student-1", archived: true });
    await setQuestionBlockArchived({ block, userId: "student-1", archived: false });
    expect(calls.updates).toEqual([
      { patch: { archived_at: "2026-10-18T15:00:00.000Z" }, filters: { id: "block-1", user_id: "student-1" } },
      { patch: { archived_at: null }, filters: { id: "block-1", user_id: "student-1" } },
    ]);
  });

  it("explains a failed archive", async () => {
    calls.error = { message: "denied" };
    await expect(setQuestionBlockArchived({ block: questionBlockFixture(), userId: "student-1", archived: true }))
      .rejects.toThrow("Não foi possível arquivar o tema.");
  });
});
