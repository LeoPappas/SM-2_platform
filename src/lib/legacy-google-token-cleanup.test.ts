import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLegacyGoogleTokens } from "./legacy-google-token-cleanup";

function stubBrowserStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => { store.delete(key); },
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("legacy Google token cleanup", () => {
  it("removes the Google credentials kept by the former Calendar integration and nothing else", () => {
    const store = stubBrowserStorage({
      "metamed.google_provider_token": "access",
      "metamed.google_provider_refresh_token": "refresh",
      "metamed.google_provider_owner": "user-1",
      "metamed.google_provider_session": "user-1:123",
      "metamed.other_preference": "keep",
    });
    clearLegacyGoogleTokens();
    expect([...store.keys()]).toEqual(["metamed.other_preference"]);
  });

  it("does nothing outside the browser", () => {
    expect(() => clearLegacyGoogleTokens()).not.toThrow();
  });

  it("tolerates blocked storage", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
    expect(() => clearLegacyGoogleTokens()).not.toThrow();
  });
});
