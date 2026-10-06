import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const googleProviderTokenKey = "metamed.google_provider_token";
const googleProviderRefreshTokenKey = "metamed.google_provider_refresh_token";
const googleProviderOwnerKey = "metamed.google_provider_owner";
const googleProviderSessionKey = "metamed.google_provider_session";
let refreshInFlight: Promise<string | null> | null = null;
let tokenGeneration = 0;

type GoogleRefreshResponse = {
  accessToken?: string;
  error?: string;
};

export function persistGoogleProviderToken(session: Session | null) {
  if (typeof window === "undefined") return;
  if (!session) return;

  const owner = window.localStorage.getItem(googleProviderOwnerKey);
  if (owner !== session.user.id) clearGoogleProviderToken();
  window.localStorage.setItem(googleProviderOwnerKey, session.user.id);
  const sessionKey = `${session.user.id}:${session.expires_at ?? ""}`;

  // Reading the same Supabase session must not overwrite a refreshed Google token.
  if (session.provider_token && (
    window.localStorage.getItem(googleProviderSessionKey) !== sessionKey
    || !window.localStorage.getItem(googleProviderTokenKey)
  )) {
    window.localStorage.setItem(googleProviderTokenKey, session.provider_token);
    window.localStorage.setItem(googleProviderSessionKey, sessionKey);
  }

  if (session.provider_refresh_token) {
    window.localStorage.setItem(googleProviderRefreshTokenKey, session.provider_refresh_token);
  }
}

export function clearGoogleProviderToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(googleProviderTokenKey);
  window.localStorage.removeItem(googleProviderRefreshTokenKey);
  window.localStorage.removeItem(googleProviderOwnerKey);
  window.localStorage.removeItem(googleProviderSessionKey);
  tokenGeneration += 1;
  refreshInFlight = null;
}

function refreshGoogleProviderToken() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = window.localStorage.getItem(googleProviderRefreshTokenKey);
  if (!refreshToken) return Promise.resolve(null);
  const generation = tokenGeneration;
  const pending = (async () => {
    try {
      const response = await fetch("/api/google/refresh-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as GoogleRefreshResponse;
      if (!data.accessToken || generation !== tokenGeneration) return null;
      window.localStorage.setItem(googleProviderTokenKey, data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    }
  })();
  refreshInFlight = pending;
  void pending.finally(() => {
    if (refreshInFlight === pending) refreshInFlight = null;
  });
  return pending;
}

export async function getGoogleProviderToken({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    clearGoogleProviderToken();
    return null;
  }
  persistGoogleProviderToken(session);

  if (typeof window === "undefined") return null;
  if (forceRefresh) return refreshGoogleProviderToken();

  return window.localStorage.getItem(googleProviderTokenKey) ?? refreshGoogleProviderToken();
}

export async function requestGoogleCalendarAccess({
  alreadyLinked,
  redirectTo,
  loginHint,
}: {
  alreadyLinked: boolean;
  redirectTo: string;
  loginHint?: string;
}) {
  const credentials = {
    provider: "google" as const,
    options: {
      redirectTo,
      scopes: "https://www.googleapis.com/auth/calendar.events",
      queryParams: {
        prompt: "consent",
        access_type: "offline",
        ...(loginHint ? { login_hint: loginHint } : {}),
      },
    },
  };
  return alreadyLinked
    ? supabase.auth.signInWithOAuth(credentials)
    : supabase.auth.linkIdentity(credentials);
}
