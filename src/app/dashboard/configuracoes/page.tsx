"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { OnboardingPanel } from "@/components/onboarding-panel";
import type { StudentProfile } from "@/lib/database.types";
import { persistGoogleProviderToken } from "@/lib/google-provider-token";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: activeSession } }) => {
      persistGoogleProviderToken(activeSession);
      setSession(activeSession);
      if (activeSession) {
        const { data } = await supabase
          .from("student_profiles")
          .select("*")
          .eq("user_id", activeSession.user.id)
          .maybeSingle();
        setProfile(data ?? null);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Carregando configurações...</div>;
  if (!session) return null;

  return (
    <div className="page-shell max-w-5xl">
      <header className="mb-10">
        <h1 className="page-title mt-0">Configurações</h1>
      </header>

      {saved && <div className="mb-7 max-w-3xl rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Alterações salvas.</div>}

      <OnboardingPanel
        userId={session.user.id}
        profile={profile}
        compact
        onSaved={nextProfile => {
          setProfile(nextProfile);
          setSaved(true);
          window.setTimeout(() => setSaved(false), 4000);
        }}
      />
    </div>
  );
}
