"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { differenceInCalendarDays, format, startOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, BarChart3, BookOpenCheck, CircleGauge, Target } from "lucide-react";
import type { BlockReview, QuestionBlock } from "@/lib/database.types";
import { persistGoogleProviderToken } from "@/lib/google-provider-token";
import { MAJOR_AREAS } from "@/lib/medical-catalog";
import { classifyPerformance, performanceLabel } from "@/lib/revision-engine";
import { supabase } from "@/lib/supabase";

export default function PerformancePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviews, setReviews] = useState<BlockReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (userId: string) => {
    const [blocksResult, reviewsResult] = await Promise.all([
      supabase.from("question_blocks").select("*").eq("user_id", userId),
      supabase.from("block_reviews").select("*").eq("user_id", userId).eq("contact_type", "review").order("review_date"),
    ]);
    if (blocksResult.error || reviewsResult.error) setError("Não foi possível carregar o desempenho.");
    setBlocks(blocksResult.data ?? []);
    setReviews(reviewsResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      persistGoogleProviderToken(activeSession);
      setSession(activeSession);
      if (activeSession) loadData(activeSession.user.id);
      else setLoading(false);
    });
  }, [loadData]);

  const weeklyTrend = useMemo(() => buildWeeklyTrend(reviews), [reviews]);
  const areaMetrics = useMemo(() => MAJOR_AREAS.map(area => {
    const areaBlocks = blocks.filter(block => block.major_area === area);
    const average = areaBlocks.length
      ? Math.round(areaBlocks.reduce((sum, block) => sum + block.accuracy_percentage, 0) / areaBlocks.length)
      : 0;
    return {
      area,
      count: areaBlocks.length,
      average,
      weak: areaBlocks.filter(block => block.accuracy_percentage < 70).length,
    };
  }), [blocks]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Calculando desempenho...</div>;

  const latestAverage = blocks.length
    ? Math.round(blocks.reduce((sum, block) => sum + block.accuracy_percentage, 0) / blocks.length)
    : 0;
  const reviewsLast30Days = reviews.filter(review => {
    const daysAgo = differenceInCalendarDays(new Date(), new Date(`${review.review_date}T12:00:00`));
    return daysAgo >= 0 && daysAgo <= 30;
  }).length;
  const smallSamples = blocks.filter(block => block.calculation_mode === "small_sample").length;
  const unclassified = blocks.filter(block => block.major_area === "A classificar").length;
  const weakTopics = [...blocks]
    .filter(block => block.accuracy_percentage < 70)
    .sort((a, b) => a.accuracy_percentage - b.accuracy_percentage)
    .slice(0, 8);
  const performanceDistribution = ["muito_bom", "bom", "ruim", "muito_ruim"].map(band => ({
    band: band as ReturnType<typeof classifyPerformance>,
    count: blocks.filter(block => (block.performance_band ?? classifyPerformance(block.accuracy_percentage)) === band).length,
  }));

  return (
    <div className="page-shell">
      {error && <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <header className="page-header">
        <div>
          <p className="page-eyebrow">Evolução por tema e grande área</p>
          <h1 className="page-title">Desempenho</h1>
          <p className="page-subtitle">Leitura baseada no resultado mais recente de cada tema e no histórico das revisões registradas.</p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 border-y border-gray-200 lg:grid-cols-4">
        <Metric icon={<BookOpenCheck size={17} />} label="Temas ativos" value={blocks.length} />
        <Metric icon={<Target size={17} />} label="Acurácia atual" value={`${latestAverage}%`} />
        <Metric icon={<BarChart3 size={17} />} label="Revisões em 30 dias" value={reviewsLast30Days} />
        <Metric icon={<CircleGauge size={17} />} label="Amostras pequenas" value={smallSamples} warning={smallSamples > 0} />
      </section>

      {unclassified > 0 && (
        <div className="mb-5 flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
          {unclassified === 1 ? "1 tema antigo não entra" : `${unclassified} temas antigos não entram`} na comparação por área até serem classificados.
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="empty-state min-h-64">As métricas aparecem depois do primeiro tema cadastrado.</div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
            <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
              <SectionHeading title="Progressão nas últimas 8 semanas" subtitle="Média das revisões concluídas em cada semana" />
              {reviews.length === 0 ? (
                <div className="flex min-h-64 items-center justify-center px-5 text-sm text-gray-400">Registre revisões para formar a curva.</div>
              ) : (
                <div className="px-4 pb-5 pt-7 sm:px-6">
                  <div className="flex h-56 items-end gap-2 border-b border-gray-200 sm:gap-4">
                    {weeklyTrend.map(week => (
                      <div key={week.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                        <span className="mb-2 text-xs font-semibold tabular-nums text-gray-700">{week.count > 0 ? `${week.average}%` : "—"}</span>
                        <div className="flex h-40 w-full max-w-12 items-end rounded-t bg-gray-100">
                          <div className="w-full rounded-t bg-emerald-600" style={{ height: `${week.count > 0 ? Math.max(6, week.average) : 0}%` }} />
                        </div>
                        <span className="mt-2 truncate text-[10px] font-medium text-gray-500">{week.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
              <SectionHeading title="Distribuição atual" subtitle="Último resultado de cada tema" />
              <div className="divide-y divide-gray-100">
                {performanceDistribution.map(({ band, count }) => {
                  const percentage = blocks.length ? Math.round((count / blocks.length) * 100) : 0;
                  return (
                    <div key={band} className="px-4 py-4">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-gray-700">{performanceLabel(band)}</span>
                        <span className="font-semibold tabular-nums text-gray-950">{count} · {percentage}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${performanceTone(band)}`} style={{ width: `${percentage}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="mt-6 overflow-hidden rounded-md border border-gray-200 bg-white">
            <SectionHeading title="Cinco grandes áreas" subtitle="Acurácia atual e quantidade de temas frágeis" />
            <div className="divide-y divide-gray-100">
              {areaMetrics.map((metric, index) => (
                <div key={metric.area} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,2fr)_6rem_7rem] sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${["bg-brand-blue", "bg-brand-sky", "bg-brand-cyan", "bg-brand-teal", "bg-brand-mint"][index]}`} />
                    <span className="text-sm font-semibold text-gray-900">{metric.area}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${["bg-brand-blue", "bg-brand-sky", "bg-brand-cyan", "bg-brand-teal", "bg-brand-mint"][index]}`} style={{ width: `${metric.average}%` }} /></div>
                  <span className="text-sm font-semibold tabular-nums text-gray-950">{metric.count ? `${metric.average}%` : "—"}</span>
                  <span className={`text-xs font-medium ${metric.weak > 0 ? "text-red-600" : "text-gray-400"}`}>{metric.weak} {metric.weak === 1 ? "tema frágil" : "temas frágeis"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-md border border-gray-200 bg-white">
            <SectionHeading title="Temas que pedem atenção" subtitle="Ordenados pelo resultado mais baixo" />
            {weakTopics.length === 0 ? (
              <div className="flex min-h-28 items-center justify-center px-5 text-sm text-gray-400">Nenhum tema abaixo de 70%.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {weakTopics.map(block => (
                  <div key={block.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_6rem_8rem] sm:items-center">
                    <span className="truncate text-sm font-semibold text-gray-950">{block.title}</span>
                    <span className="truncate text-xs text-gray-500">{block.major_area} · {block.specialty}</span>
                    <span className="text-sm font-semibold tabular-nums text-red-700">{block.accuracy_percentage}%</span>
                    <span className="text-xs text-gray-500">Retorna em {block.interval_days} dias</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function buildWeeklyTrend(reviews: BlockReview[]) {
  const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 8 }, (_, index) => {
    const weekStart = subWeeks(currentWeek, 7 - index);
    const key = format(weekStart, "yyyy-MM-dd");
    const weekReviews = reviews.filter(review => format(startOfWeek(new Date(`${review.review_date}T12:00:00`), { weekStartsOn: 1 }), "yyyy-MM-dd") === key);
    return {
      key,
      label: format(weekStart, "dd/MM", { locale: ptBR }),
      count: weekReviews.length,
      average: weekReviews.length ? Math.round(weekReviews.reduce((sum, review) => sum + review.accuracy_percentage, 0) / weekReviews.length) : 0,
    };
  });
}

function Metric({ icon, label, value, warning }: { icon: React.ReactNode; label: string; value: string | number; warning?: boolean }) {
  return (
    <div className="border-r border-gray-200 px-4 py-4 last:border-r-0">
      <div className={`flex items-center gap-2 text-xs font-medium ${warning ? "text-amber-700" : "text-gray-500"}`}>{icon}{label}</div>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${warning ? "text-amber-800" : "text-gray-950"}`}>{value}</p>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-gray-200 px-4 py-3.5"><h2 className="text-sm font-semibold text-gray-950">{title}</h2><p className="mt-0.5 text-xs text-gray-500">{subtitle}</p></div>;
}

function performanceTone(band: ReturnType<typeof classifyPerformance>) {
  return {
    muito_bom: "bg-emerald-600",
    bom: "bg-blue-500",
    ruim: "bg-amber-500",
    muito_ruim: "bg-red-500",
  }[band];
}
