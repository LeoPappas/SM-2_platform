export type CalendarSyncStatus = "pending" | "synced" | "failed" | "disabled";

export type CalendarSyncErrorCode =
  | "missing_token"
  | "unauthorized"
  | "insufficient_scope"
  | "not_found"
  | "api_error"
  | "network_error";

export type CalendarSyncResult =
  | {
      ok: true;
      eventId: string;
      recreated: boolean;
    }
  | {
      ok: false;
      code: CalendarSyncErrorCode;
      message: string;
      status?: number;
    };

export type CalendarDeleteResult =
  | { ok: true }
  | {
      ok: false;
      code: CalendarSyncErrorCode;
      message: string;
      status?: number;
    };

type GoogleCalendarError = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
  message?: string;
};

const calendarEventsUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function getNextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().split("T")[0];
}

async function readGoogleError(response: Response): Promise<GoogleCalendarError | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function classifyGoogleError(status: number): CalendarSyncErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "insufficient_scope";
  if (status === 404 || status === 410) return "not_found";
  return "api_error";
}

function calendarFailure(status: number, payload: GoogleCalendarError | null): CalendarSyncResult {
  const code = classifyGoogleError(status);
  const apiMessage = payload?.error?.message ?? payload?.message;
  const fallbackMessage = {
    unauthorized: "Sessao Google expirada. Entre novamente para reautorizar o Calendar.",
    insufficient_scope: "Permissao do Google Calendar ausente ou insuficiente. Entre novamente concedendo acesso ao Calendar.",
    not_found: "Evento do Google Calendar nao encontrado.",
    api_error: "Nao foi possivel sincronizar com o Google Calendar.",
    missing_token: "Token do Google Calendar ausente.",
    network_error: "Falha de rede ao sincronizar com o Google Calendar.",
  }[code];

  return {
    ok: false,
    code,
    status,
    message: apiMessage ? `${fallbackMessage} (${apiMessage})` : fallbackMessage,
  };
}

export function missingCalendarTokenResult(): CalendarSyncResult {
  return {
    ok: false,
    code: "missing_token",
    message: "Conecte novamente com Google para liberar a sincronizacao com Calendar.",
  };
}

export function calendarSyncSuccessPatch(eventId: string) {
  return {
    calendar_event_id: eventId,
    calendar_sync_enabled: true,
    calendar_sync_status: "synced" as CalendarSyncStatus,
    calendar_last_error: null,
    calendar_last_synced_at: new Date().toISOString(),
  };
}

export function calendarSyncFailurePatch(message: string) {
  return {
    calendar_sync_enabled: true,
    calendar_sync_status: "failed" as CalendarSyncStatus,
    calendar_last_error: message,
  };
}

export function calendarSyncDisabledPatch() {
  return {
    calendar_event_id: null,
    calendar_sync_enabled: false,
    calendar_sync_status: "disabled" as CalendarSyncStatus,
    calendar_last_error: null,
    calendar_sync_fingerprint: null,
  };
}

export function calendarSyncClearedPatch(fingerprint: string) {
  return {
    calendar_event_id: null,
    calendar_sync_enabled: true,
    calendar_sync_status: "synced" as CalendarSyncStatus,
    calendar_last_error: null,
    calendar_last_synced_at: new Date().toISOString(),
    calendar_sync_fingerprint: fingerprint,
  };
}

export function stableCalendarEventId(blockId: string) {
  return `metamed${blockId.toLowerCase().replace(/[^a-v0-9]/g, "")}`;
}

export function calendarSyncPatchFromResult(result: CalendarSyncResult) {
  if (result.ok) return calendarSyncSuccessPatch(result.eventId);
  return calendarSyncFailurePatch(result.message);
}

export async function createOrUpdateCalendarEvent({
  providerToken,
  eventId,
  summary,
  description,
  date,
  stableEventId,
  blockId,
}: {
  providerToken: string;
  eventId?: string | null;
  summary: string;
  description: string;
  date: string;
  stableEventId?: string;
  blockId?: string;
}): Promise<CalendarSyncResult> {
  const event = {
    summary: `Revisar bloco: ${summary}`,
    description,
    transparency: "transparent",
    extendedProperties: blockId ? { private: { metamedBlockId: blockId } } : undefined,
    start: {
      date,
    },
    end: {
      // For all-day events, Google Calendar expects an exclusive end date.
      date: getNextDate(date),
    },
  };

  try {
    const writeEvent = async (targetEventId?: string | null, includeStableId = true) => fetch(
      targetEventId
        ? `${calendarEventsUrl}/${encodeURIComponent(targetEventId)}`
        : calendarEventsUrl,
      {
      method: targetEventId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(targetEventId ? event : { ...event, id: includeStableId ? stableEventId : undefined }),
    });

    const findExistingEvent = async (): Promise<CalendarSyncResult | string | null> => {
      if (!blockId) return null;
      const query = new URLSearchParams({
        privateExtendedProperty: `metamedBlockId=${blockId}`,
        showDeleted: "false",
        singleEvents: "true",
        maxResults: "1",
      });
      const lookupResponse = await fetch(`${calendarEventsUrl}?${query}`, {
        headers: { Authorization: `Bearer ${providerToken}` },
      });
      if (!lookupResponse.ok) return calendarFailure(lookupResponse.status, await readGoogleError(lookupResponse));
      const lookupData = await lookupResponse.json() as { items?: Array<{ id?: string }> };
      return lookupData.items?.[0]?.id ?? null;
    };

    let targetEventId = eventId;
    if (!targetEventId) {
      const existing = await findExistingEvent();
      if (typeof existing === "object" && existing?.ok === false) return existing;
      if (typeof existing === "string") targetEventId = existing;
    }

    const response = await writeEvent(targetEventId);

    if (!response.ok && targetEventId && (response.status === 404 || response.status === 410)) {
      const existing = await findExistingEvent();
      if (typeof existing === "object" && existing?.ok === false) return existing;
      if (typeof existing === "string" && existing !== targetEventId) {
        const recoveredResponse = await writeEvent(existing);
        if (!recoveredResponse.ok) return calendarFailure(recoveredResponse.status, await readGoogleError(recoveredResponse));
        const recoveredData = await recoveredResponse.json();
        return { ok: true, eventId: recoveredData.id as string, recreated: true };
      }

      const fallbackResponse = await writeEvent(null);

      if (fallbackResponse.status === 409 && stableEventId) {
        const retryResponse = await writeEvent(stableEventId);
        if (!retryResponse.ok && (retryResponse.status === 404 || retryResponse.status === 410)) {
          const generatedResponse = await writeEvent(null, false);
          if (!generatedResponse.ok) return calendarFailure(generatedResponse.status, await readGoogleError(generatedResponse));
          const generatedData = await generatedResponse.json();
          return { ok: true, eventId: generatedData.id as string, recreated: true };
        }
        if (!retryResponse.ok) return calendarFailure(retryResponse.status, await readGoogleError(retryResponse));
        const retryData = await retryResponse.json();
        return { ok: true, eventId: retryData.id as string, recreated: true };
      }

      if (!fallbackResponse.ok) {
        return calendarFailure(fallbackResponse.status, await readGoogleError(fallbackResponse));
      }

      const data = await fallbackResponse.json();
      return { ok: true, eventId: data.id as string, recreated: true };
    }

    if (!response.ok && !targetEventId && response.status === 409 && stableEventId) {
      const retryResponse = await writeEvent(stableEventId);
      if (!retryResponse.ok && (retryResponse.status === 404 || retryResponse.status === 410)) {
        const generatedResponse = await writeEvent(null, false);
        if (!generatedResponse.ok) return calendarFailure(generatedResponse.status, await readGoogleError(generatedResponse));
        const generatedData = await generatedResponse.json();
        return { ok: true, eventId: generatedData.id as string, recreated: false };
      }
      if (!retryResponse.ok) return calendarFailure(retryResponse.status, await readGoogleError(retryResponse));
      const retryData = await retryResponse.json();
      return { ok: true, eventId: retryData.id as string, recreated: false };
    }

    if (!response.ok) {
      return calendarFailure(response.status, await readGoogleError(response));
    }

    const data = await response.json();
    return { ok: true, eventId: data.id as string, recreated: false };
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: "Falha de rede ao sincronizar com o Google Calendar.",
    };
  }
}

export async function deleteCalendarEvent({
  providerToken,
  eventId,
}: {
  providerToken: string;
  eventId: string;
}): Promise<CalendarDeleteResult> {
  try {
    const url = `${calendarEventsUrl}/${encodeURIComponent(eventId)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${providerToken}` },
    });

    if (response.ok || response.status === 404 || response.status === 410) return { ok: true };
    return calendarFailure(response.status, await readGoogleError(response));
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: "Falha de rede ao sincronizar com o Google Calendar.",
    };
  }
}
