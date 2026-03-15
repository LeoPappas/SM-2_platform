"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Stethoscope } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/dashboard");
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.push("/dashboard");
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        scopes: 'https://www.googleapis.com/auth/calendar.events', // Solicita acesso ao calendário para o one-way sync
      },
    });
  };

  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
          <Stethoscope size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Plataforma SM-2</h1>
        <p className="text-gray-500 mb-8">Repetição Espaçada para Medicina</p>
        
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 px-4 rounded-lg transition-colors focus:ring-4 focus:ring-gray-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.66 15.63 16.88 16.78 15.72 17.56V20.32H19.28C21.36 18.41 22.56 15.6 22.56 12.25Z" fill="#4285F4"/>
            <path d="M12 23C14.97 23 17.46 22.02 19.28 20.32L15.72 17.56C14.74 18.22 13.48 18.63 12 18.63C9.13 18.63 6.71 16.69 5.84 14.08H2.17V16.92C3.98 20.53 7.69 23 12 23Z" fill="#34A853"/>
            <path d="M5.84 14.08C5.62 13.42 5.49 12.72 5.49 12C5.49 11.28 5.62 10.58 5.84 9.92V7.08H2.17C1.43 8.55 1 10.22 1 12C1 13.78 1.43 15.45 2.17 16.92L5.84 14.08Z" fill="#FBBC05"/>
            <path d="M12 5.38C13.62 5.38 15.06 5.94 16.21 7.03L19.35 3.89C17.45 2.12 14.97 1 12 1C7.69 1 3.98 3.47 2.17 7.08L5.84 9.92C6.71 7.31 9.13 5.38 12 5.38Z" fill="#EA4335"/>
          </svg>
          Entrar com Google
        </button>
      </div>
    </div>
  );
}
