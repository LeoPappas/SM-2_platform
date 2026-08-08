import {
  createOrUpdateCalendarEvent,
  deleteCalendarEvent,
  missingCalendarTokenResult,
  type CalendarDeleteResult,
  type CalendarSyncResult,
} from "./calendar";
import { getGoogleProviderToken } from "./google-provider-token";

type SyncCalendarEventInput = {
  eventId?: string | null;
  stableEventId?: string;
  blockId?: string;
  summary: string;
  description: string;
  date: string;
};

export async function createOrUpdateCalendarEventWithAuth(input: SyncCalendarEventInput): Promise<CalendarSyncResult> {
  const token = await getGoogleProviderToken();
  if (!token) return missingCalendarTokenResult();

  const result = await createOrUpdateCalendarEvent({ providerToken: token, ...input });
  if (result.ok || result.code !== "unauthorized") return result;

  const refreshedToken = await getGoogleProviderToken({ forceRefresh: true });
  if (!refreshedToken || refreshedToken === token) return result;

  return createOrUpdateCalendarEvent({ providerToken: refreshedToken, ...input });
}

export async function deleteCalendarEventWithAuth(eventId: string): Promise<CalendarDeleteResult> {
  const token = await getGoogleProviderToken();
  if (!token) return missingCalendarTokenResult();

  const result = await deleteCalendarEvent({ providerToken: token, eventId });
  if (result.ok || result.code !== "unauthorized") return result;

  const refreshedToken = await getGoogleProviderToken({ forceRefresh: true });
  if (!refreshedToken || refreshedToken === token) return result;

  return deleteCalendarEvent({ providerToken: refreshedToken, eventId });
}
