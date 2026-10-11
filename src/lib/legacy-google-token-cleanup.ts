const legacyKeys = [
  "metamed.google_provider_token",
  "metamed.google_provider_refresh_token",
  "metamed.google_provider_owner",
  "metamed.google_provider_session",
];

/** The Calendar integration kept Google credentials in localStorage; remove what it left behind. */
export function clearLegacyGoogleTokens() {
  if (typeof window === "undefined") return;
  try {
    for (const key of legacyKeys) window.localStorage.removeItem(key);
  } catch {
    // Blocked storage has nothing to clean.
  }
}
