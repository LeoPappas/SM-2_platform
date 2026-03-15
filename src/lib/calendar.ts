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
      // Para all-day events, a data de de término tem que ser o dia seguinte
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

  if (!response.ok) {
    console.error("Erro ao sincronizar com Google Calendar", await response.json());
    return null;
  }

  const data = await response.json();
  return data.id as string;
}
