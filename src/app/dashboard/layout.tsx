"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  Home,
  LogOut,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { BrandName } from "@/components/brand-name";
import { reconcileQuestionBlocksCalendar } from "@/lib/calendar-sync";
import { clearGoogleProviderToken, persistGoogleProviderToken } from "@/lib/google-provider-token";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/dashboard", label: "Início", icon: Home },
  { href: "/dashboard/blocos", label: "Temas", icon: BookOpenCheck },
  { href: "/dashboard/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/dashboard/metricas", label: "Desempenho", icon: BarChart3 },
  { href: "/dashboard/simulador", label: "Simulador", icon: SlidersHorizontal },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      persistGoogleProviderToken(session);
      if (!session) router.replace("/");
      else {
        setChecking(false);
        void reconcileQuestionBlocksCalendar(session.user.id);
      }
    });
  }, [router]);

  const logout = async () => {
    clearGoogleProviderToken();
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-950 text-sm text-gray-400">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-black md:sticky md:top-0 md:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <Image src="/metamed-logo.svg" alt="" width={36} height={33} className="h-9 w-9 object-contain" priority />
          <span>
            <BrandName className="block text-base text-white" />
            <span className="block text-xs text-gray-500">Revisão por temas</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map(item => <NavigationItem key={item.href} item={item} pathname={pathname} />)}
        </nav>

        <div className="flex items-center gap-1 border-t border-gray-800 p-3">
          <Link href="/dashboard/configuracoes" title="Configurações" aria-label="Configurações" className={`icon-button shrink-0 ${pathname.startsWith("/dashboard/configuracoes") ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-white"}`}>
            <Settings2 size={17} />
          </Link>
          <button type="button" onClick={logout} className="flex flex-1 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-900 hover:text-white">
            <LogOut size={17} /> Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image src="/metamed-logo.svg" alt="" width={32} height={29} className="h-8 w-8 object-contain" priority />
            <BrandName className="text-base text-gray-950" />
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/dashboard/configuracoes" className="icon-button" aria-label="Configurações"><Settings2 size={17} /></Link>
            <button type="button" onClick={logout} className="icon-button" aria-label="Sair"><LogOut size={17} /></button>
          </div>
        </header>

        <main className="min-h-screen pt-14 md:pt-0">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-gray-200 bg-white px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 md:hidden">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} title={label} aria-label={label} className={`flex h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium ${active ? "text-emerald-700" : "text-gray-400"}`}>
                <Icon size={18} />
                <span className="max-w-full truncate">{label === "Desempenho" ? "Métricas" : label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function NavigationItem({ item, pathname }: { item: (typeof navItems)[number]; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${active ? "bg-brand-mint text-black" : "text-gray-400 hover:bg-gray-900 hover:text-white"}`}>
      <Icon size={17} /> {item.label}
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}
