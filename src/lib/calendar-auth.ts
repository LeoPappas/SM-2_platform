import {
  createOrUpdateCalendarEvent,
  missingCalendarTokenResult,
  type CalendarSyncResult,
} from "@/lib/calendar";
import { getGoogleProviderToken } from "@/lib/google-provider-token";

type SyncCalendarEventInput = {
  eventId?: string | null;
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
