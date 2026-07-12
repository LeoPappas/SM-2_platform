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
  };
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
}: {
  providerToken: string;
  eventId?: string | null;
  summary: string;
  description: string;
  date: string;
}): Promise<CalendarSyncResult> {
  const url = eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
    : calendarEventsUrl;

  const method = eventId ? "PUT" : "POST";

  const event = {
    summary: `Revisar bloco: ${summary}`,
    description,
    transparency: "transparent",
    start: {
      date,
    },
    end: {
      // For all-day events, Google Calendar expects an exclusive end date.
      date: getNextDate(date),
    },
  };

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok && eventId && (response.status === 404 || response.status === 410)) {
      const fallbackResponse = await fetch(calendarEventsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!fallbackResponse.ok) {
        return calendarFailure(fallbackResponse.status, await readGoogleError(fallbackResponse));
      }

      const data = await fallbackResponse.json();
      return { ok: true, eventId: data.id as string, recreated: true };
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
}) {
  const url = `${calendarEventsUrl}/${eventId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${providerToken}` },
  });

  return response.ok || response.status === 410;
}
