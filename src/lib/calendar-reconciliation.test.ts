import { describe, expect, it, vi } from "vitest";
const reconcile = vi.hoisted(() => vi.fn());
vi.mock("./calendar-sync", () => ({ reconcileQuestionBlocksCalendar: reconcile }));
import { reconcileCalendar } from "./calendar-reconciliation";

describe("serialized Calendar recovery", () => {
  it("coalesces overlap into one additional round and returns the last recovery outcome", async () => {
    reconcile.mockReset();
    let resolveFirst!: (value: { synced: number; failed: number }) => void;
    reconcile.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ synced: 2, failed: 0 });
    const first = reconcileCalendar("overlapping-user");
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    const second = reconcileCalendar("overlapping-user");
    expect(second).toBe(first);
    expect(reconcileCalendar("overlapping-user")).toBe(first);
    resolveFirst({ synced: 0, failed: 2 });
    expect(await first).toEqual({ synced: 2, failed: 0 });
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("releases a failed round so a later user event can retry", async () => {
    reconcile.mockReset();
    reconcile.mockRejectedValueOnce(new Error("offline"));
    await expect(reconcileCalendar("retry-user")).rejects.toThrow("offline");
    reconcile.mockResolvedValueOnce({ synced: 1, failed: 0 });
    expect(await reconcileCalendar("retry-user")).toEqual({ synced: 1, failed: 0 });
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("caps recovery at two rounds even when more events arrive in the second", async () => {
    reconcile.mockReset();
    let resolveSecond!: (value: { synced: number; failed: number }) => void;
    reconcile.mockResolvedValueOnce({ synced: 1, failed: 0 })
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
    const pending = reconcileCalendar("bounded-user");
    reconcileCalendar("bounded-user");
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
    reconcileCalendar("bounded-user");
    resolveSecond({ synced: 1, failed: 0 });
    await pending;
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
});
