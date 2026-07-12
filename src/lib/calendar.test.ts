import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calendarSyncDisabledPatch,
  calendarSyncFailurePatch,
  calendarSyncPatchFromResult,
  calendarSyncSuccessPatch,
  createOrUpdateCalendarEvent,
  missingCalendarTokenResult,
} from "./calendar";

const baseCalendarInput = {
  providerToken: "google-token",
  summary: "Cardiologia",
  description: "Revisao de bloco",
  date: "2026-07-05",
};

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOrUpdateCalendarEvent", () => {
  it("creates an all-day event in the primary calendar", async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({ id: "event-1" }),
    });

    const result = await createOrUpdateCalendarEvent(baseCalendarInput);

    expect(result).toEqual({ ok: true, eventId: "event-1", recreated: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      expect.objectContaining({ method: "POST" }),
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({
      summary: "Revisar bloco: Cardiologia",
      transparency: "transparent",
      start: { date: "2026-07-05" },
      end: { date: "2026-07-06" },
    });
    expect(body.start).not.toHaveProperty("timeZone");
    expect(body.end).not.toHaveProperty("timeZone");
  });

  it("recreates the event when the stored Google event was deleted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 410,
        json: async () => ({ error: { message: "Gone" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "event-2" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOrUpdateCalendarEvent({
      ...baseCalendarInput,
      eventId: "deleted-event",
    });

    expect(result).toEqual({ ok: true, eventId: "event-2", recreated: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
  });

  it("returns a structured error for missing Calendar permission", async () => {
    mockFetch({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "Insufficient Permission" } }),
    });

    const result = await createOrUpdateCalendarEvent(baseCalendarInput);

    expect(result).toMatchObject({
      ok: false,
      code: "insufficient_scope",
      status: 403,
    });
    expect(result.ok ? "" : result.message).toContain("Permissao do Google Calendar");
  });
});

describe("calendar sync patches", () => {
  it("maps sync results to database patches", () => {
    expect(calendarSyncPatchFromResult({ ok: true, eventId: "event-1", recreated: false })).toMatchObject({
      calendar_event_id: "event-1",
      calendar_sync_enabled: true,
      calendar_sync_status: "synced",
      calendar_last_error: null,
    });

    expect(calendarSyncPatchFromResult(missingCalendarTokenResult())).toMatchObject({
      calendar_sync_enabled: true,
      calendar_sync_status: "failed",
    });
  });

  it("builds explicit success, failure, and disabled patches", () => {
    expect(calendarSyncSuccessPatch("event-3")).toMatchObject({
      calendar_event_id: "event-3",
      calendar_sync_status: "synced",
    });
    expect(calendarSyncFailurePatch("erro")).toMatchObject({
      calendar_sync_status: "failed",
      calendar_last_error: "erro",
    });
    expect(calendarSyncDisabledPatch()).toEqual({
      calendar_event_id: null,
      calendar_sync_enabled: false,
      calendar_sync_status: "disabled",
      calendar_last_error: null,
    });
  });
});
