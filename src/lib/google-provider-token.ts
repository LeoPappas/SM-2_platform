import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const googleProviderTokenKey = "metamed.google_provider_token";
const googleProviderRefreshTokenKey = "metamed.google_provider_refresh_token";

type GoogleRefreshResponse = {
  accessToken?: string;
  error?: string;
};

export function persistGoogleProviderToken(session: Session | null) {
  if (typeof window === "undefined") return;

  if (session?.provider_token) {
    window.localStorage.setItem(googleProviderTokenKey, session.provider_token);
  }

  if (session?.provider_refresh_token) {
    window.localStorage.setItem(googleProviderRefreshTokenKey, session.provider_refresh_token);
  }
}

export function clearGoogleProviderToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(googleProviderTokenKey);
  window.localStorage.removeItem(googleProviderRefreshTokenKey);
}

async function refreshGoogleProviderToken() {
  if (typeof window === "undefined") return null;

  const refreshToken = window.localStorage.getItem(googleProviderRefreshTokenKey);
  if (!refreshToken) return null;

  const response = await fetch("/api/google/refresh-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as GoogleRefreshResponse;
  if (!data.accessToken) return null;

  window.localStorage.setItem(googleProviderTokenKey, data.accessToken);
  return data.accessToken;
}

export async function getGoogleProviderToken({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  if (forceRefresh) {
    return refreshGoogleProviderToken();
  }

  const { data: { session } } = await supabase.auth.getSession();
  persistGoogleProviderToken(session);

  if (session?.provider_token) return session.provider_token;
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(googleProviderTokenKey) ?? refreshGoogleProviderToken();
}
