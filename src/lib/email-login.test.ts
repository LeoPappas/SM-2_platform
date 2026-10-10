import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { auth } }));
import { requestEmailLogin } from "./email-login";

beforeEach(() => {
  vi.resetAllMocks();
  auth.signInWithOtp.mockResolvedValue({ error: null });
});

describe("requestEmailLogin", () => {
  it("sends a magic link to the trimmed, lowercased email and returns to the dashboard", async () => {
    const result = await requestEmailLogin("  Aluno@Example.Test ", "https://example.test/dashboard");
    expect(result).toEqual({ ok: true });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "aluno@example.test",
      options: { emailRedirectTo: "https://example.test/dashboard" },
    });
  });

  it("rejects an invalid email without calling Supabase", async () => {
    const result = await requestEmailLogin("not-an-email", "https://example.test/dashboard");
    expect(result).toEqual({ ok: false, message: "Informe um e-mail válido." });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns a friendly message when Supabase fails", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: new Error("rate limit") });
    const result = await requestEmailLogin("aluno@example.test", "https://example.test/dashboard");
    expect(result).toEqual({ ok: false, message: "Não foi possível enviar o link. Tente novamente em instantes." });
  });
});
