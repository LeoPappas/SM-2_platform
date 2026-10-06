import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), signInWithOAuth: vi.fn(), linkIdentity: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { auth } }));
import { clearGoogleProviderToken, getGoogleProviderToken, persistGoogleProviderToken, requestGoogleCalendarAccess } from "./google-provider-token";

const session = {
  user: { id: "student-one" },
  expires_at: 1_800_000_000,
  provider_token: "initial-test-token",
  provider_refresh_token: "test-refresh-token",
} as Session;

beforeEach(() => {
  vi.resetAllMocks();
  const stored = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  } });
  auth.getSession.mockResolvedValue({ data: { session } });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.linkIdentity.mockResolvedValue({ error: null });
});

afterEach(() => {
  clearGoogleProviderToken();
  vi.unstubAllGlobals();
});

describe("Google Calendar permission recovery", () => {
  it("renews an existing Google identity with OAuth and offline Calendar consent", async () => {
    await requestGoogleCalendarAccess({ alreadyLinked: true, redirectTo: "https://example.test/dashboard/configuracoes", loginHint: "student@example.test" });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://example.test/dashboard/configuracoes",
        scopes: "https://www.googleapis.com/auth/calendar.events",
        queryParams: { prompt: "consent", access_type: "offline", login_hint: "student@example.test" },
      },
    });
  });

  it("links Google to the current student when no identity exists", async () => {
    await requestGoogleCalendarAccess({ alreadyLinked: false, redirectTo: "https://example.test/dashboard/configuracoes" });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(auth.linkIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" }));
  });

  it("coalesces simultaneous refreshes and preserves the renewed token when reading the same session", async () => {
    persistGoogleProviderToken(session);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: "renewed-test-token" }) });
    vi.stubGlobal("fetch", fetchMock);
    const tokens = await Promise.all([
      getGoogleProviderToken({ forceRefresh: true }),
      getGoogleProviderToken({ forceRefresh: true }),
    ]);
    expect(tokens).toEqual(["renewed-test-token", "renewed-test-token"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getGoogleProviderToken()).toBe("renewed-test-token");
  });

  it("clears the previous student's tokens before reading a different user", async () => {
    persistGoogleProviderToken(session);
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "student-two" }, expires_at: session.expires_at } } });
    expect(await getGoogleProviderToken()).toBeNull();
  });

  it("does not restore tokens when a refresh finishes after sign-out", async () => {
    persistGoogleProviderToken(session);
    let resolveFetch!: (response: unknown) => void;
    const fetchMock = vi.fn(() => new Promise(resolve => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = getGoogleProviderToken({ forceRefresh: true });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    clearGoogleProviderToken();
    resolveFetch({ ok: true, json: async () => ({ accessToken: "late-test-token" }) });
    expect(await pending).toBeNull();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await getGoogleProviderToken()).toBeNull();
  });
});
