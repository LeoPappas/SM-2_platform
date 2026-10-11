import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(__dirname, "..");
const leftovers = /googleapis|calendar_sync|calendar_event|calendar_last|Google Calendar|google-provider-token|provider_token/;
// The cleanup module and its test must name the old storage keys to remove them.
const allowed = new Set(["lib/legacy-google-token-cleanup.ts", "lib/legacy-google-token-cleanup.test.ts", "lib/calendar-removal.test.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("Google Calendar removal", () => {
  it("leaves no Calendar sync code, state or copy in the app", () => {
    const offenders = sourceFiles(srcRoot)
      .filter(file => !allowed.has(relative(srcRoot, file).replaceAll("\\", "/")))
      .filter(file => leftovers.test(readFileSync(file, "utf8")))
      .map(file => relative(srcRoot, file));
    expect(offenders).toEqual([]);
  });

  it("asks Google for the basic scopes only", () => {
    const login = readFileSync(join(srcRoot, "app/page.tsx"), "utf8");
    expect(login).toContain('provider: "google"');
    expect(login).not.toMatch(/scopes|access_type|prompt:/);
  });
});
