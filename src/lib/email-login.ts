import { supabase } from "./supabase";

export type EmailLoginResult = { ok: true } | { ok: false; message: string };

export async function requestEmailLogin(rawEmail: string, redirectTo: string): Promise<EmailLoginResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Informe um e-mail válido." };

  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) return { ok: false, message: "Não foi possível enviar o link. Tente novamente em instantes." };
  return { ok: true };
}
