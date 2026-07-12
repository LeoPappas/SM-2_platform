"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart2, BookOpenCheck, Calendar, Home, LogOut, Trophy } from "lucide-react";
import { clearGoogleProviderToken, persistGoogleProviderToken } from "@/lib/google-provider-token";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/metricas", label: "Métricas", icon: BarChart2 },
  { href: "/dashboard/calendario", label: "Calendário", icon: Calendar },
  { href: "/dashboard/blocos", label: "Blocos", icon: BookOpenCheck },
  { href: "/dashboard/rankings", label: "Rankings", icon: Trophy },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      persistGoogleProviderToken(session);
      if (!session) router.replace("/");
      else setChecking(false);
    });
  }, [router]);

  const handleLogout = async () => {
    clearGoogleProviderToken();
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-sm text-gray-500">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-5">
          <span className="text-sm font-bold tracking-wide text-white">MetaMed Revisão</span>
        </div>

        <nav className="mt-1 flex-1 space-y-0.5 p-3">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
