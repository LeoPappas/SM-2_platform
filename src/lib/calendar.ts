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
  date: string; // YYYY-MM-DD
}) {
  const url = eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
    : `https://www.googleapis.com/calendar/v3/calendars/primary/events`;

  const method = eventId ? "PUT" : "POST";

  const event = {
    summary: `Revisar: ${summary}`,
    description: description,
    start: {
      date: date,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      // Para all-day events, a data de término tem que ser o dia seguinte
      date: new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${providerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  // If PUT returned 404/410, the event was deleted externally — fall back to POST
  if (!response.ok && eventId && (response.status === 404 || response.status === 410)) {
    const fallbackUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
    const fallbackResponse = await fetch(fallbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
    if (!fallbackResponse.ok) {
      console.error("Fallback POST also failed", await fallbackResponse.json());
      return null;
    }
    const data = await fallbackResponse.json();
    return data.id as string;
  }

  if (!response.ok) {
    console.error("Erro ao sincronizar com Google Calendar", await response.json());
    return null;
  }

  const data = await response.json();
  return data.id as string;
}

export async function deleteCalendarEvent({
  providerToken,
  eventId,
}: {
  providerToken: string;
  eventId: string;
}) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  // 204 = success, 410 = already deleted — both are fine
  return response.ok || response.status === 410;
}
