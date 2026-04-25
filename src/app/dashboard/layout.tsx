"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Home, BarChart2, Calendar, BookOpen, Trophy, LogOut } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/metricas", label: "Métricas", icon: BarChart2 },
  { href: "/dashboard/calendario", label: "Calendário", icon: Calendar },
  { href: "/dashboard/temas", label: "Temas", icon: BookOpen },
  { href: "/dashboard/rankings", label: "Rankings", icon: Trophy },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace("/");
      else setChecking(false);
    });
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-500 text-sm">
      Carregando...
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="w-56 bg-gray-900 flex flex-col shrink-0 overflow-y-auto">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="text-sm font-bold text-white tracking-wide">SM-2 Medicina</span>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 mt-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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

        <div className="p-3 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white w-full transition-colors"
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
