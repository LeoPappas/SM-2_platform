"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle, BarChart3, BookOpenCheck, CircleGauge, Target } from "lucide-react";
import type { BlockReview, QuestionBlock, StudentProfile } from "@/lib/database.types";
import { persistGoogleProviderToken } from "@/lib/google-provider-token";
import { MAJOR_AREAS } from "@/lib/medical-catalog";
import { classifyPerformance, performanceLabel } from "@/lib/revision-engine";
import { buildWeeklyPerformanceTrend, questionWeightedAccuracy, todayInTimezone } from "@/lib/performance-metrics";
import { supabase } from "@/lib/supabase";

export default function PerformancePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviews, setReviews] = useState<BlockReview[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (userId: string) => {
    const [blocksResult, reviewsResult, profileResult] = await Promise.all([
      supabase.from("question_blocks").select("*").eq("user_id", userId),
      supabase.from("block_reviews").select("*").eq("user_id", userId).eq("contact_type", "review").order("review_date"),
      supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (blocksResult.error || reviewsResult.error || profileResult.error) setError("Não foi possível carregar todo o desempenho.");
    setBlocks(blocksResult.data ?? []);
    setReviews(reviewsResult.data ?? []);
    setProfile(profileResult.data ?? null);
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

  const today = todayInTimezone(profile?.timezone);
  const weeklyTrend = useMemo(() => buildWeeklyPerformanceTrend({
    reviews,
    referenceDate: today,
    weekStartsOn: profile?.week_starts_on,
  }), [profile?.week_starts_on, reviews, today]);
  const areaMetrics = useMemo(() => MAJOR_AREAS.map(area => {
    const areaBlocks = blocks.filter(block => block.major_area === area);
    const accuracy = questionWeightedAccuracy(areaBlocks);
    return {
      area,
      count: areaBlocks.length,
      average: accuracy.accuracy,
      questionCount: accuracy.questionCount,
      weak: areaBlocks.filter(block => block.question_count > 0 && block.accuracy_percentage < 70).length,
    };
  }), [blocks]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Calculando desempenho...</div>;

  const latestAccuracy = questionWeightedAccuracy(blocks);
  const reviewsLast30Days = reviews.filter(review => {
    const daysAgo = differenceInCalendarDays(new Date(`${today}T12:00:00`), new Date(`${review.review_date}T12:00:00`));
    return daysAgo >= 0 && daysAgo <= 30;
  }).length;
  const smallSamples = blocks.filter(block => block.question_count > 0 && block.question_count < 20).length;
  const measuredBlocks = blocks.filter(block => block.question_count > 0);
  const withoutSample = blocks.length - measuredBlocks.length;
  const unclassified = blocks.filter(block => block.major_area === "A classificar").length;
  const weakTopics = [...blocks]
    .filter(block => block.question_count > 0 && block.accuracy_percentage < 70)
    .sort((a, b) => a.accuracy_percentage - b.accuracy_percentage)
    .slice(0, 8);
  const performanceDistribution = ["muito_bom", "bom", "ruim", "muito_ruim"].map(band => ({
    band: band as ReturnType<typeof classifyPerformance>,
    count: measuredBlocks.filter(block => (block.performance_band ?? classifyPerformance(block.accuracy_percentage)) === band).length,
  }));

  return (
    <div className="page-shell">
      {error && <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <header className="page-header">
        <div>
          <p className="page-eyebrow">Evolução por tema e grande área</p>
          <h1 className="page-title">Desempenho</h1>
          <p className="page-subtitle">Acurácia calculada pelos acertos sobre o total de questões. O retrato atual usa o último contato de cada tema; a progressão usa as revisões registradas.</p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 overflow-hidden card lg:grid-cols-4">
        <Metric icon={<BookOpenCheck size={17} />} label="Temas ativos" value={blocks.length} />
        <Metric icon={<Target size={17} />} label="Acurácia atual" value={latestAccuracy.accuracy === null ? "Sem amostra" : `${latestAccuracy.accuracy}%`} />
        <Metric icon={<BarChart3 size={17} />} label="Revisões em 30 dias" value={reviewsLast30Days} />
        <Metric icon={<CircleGauge size={17} />} label="Amostras pequenas" value={smallSamples} warning={smallSamples > 0} />
      </section>
      <p className="mb-5 text-xs leading-5 text-gray-500">
        {latestAccuracy.questionCount > 0 ? `${latestAccuracy.correctCount} acertos em ${latestAccuracy.questionCount} questões nos últimos contatos.` : "Ainda não há questões registradas para calcular a acurácia."}
        {withoutSample > 0 && ` ${withoutSample} ${withoutSample === 1 ? "tema sem questões não entra" : "temas sem questões não entram"} nas comparações de desempenho.`}
      </p>

      {unclassified > 0 && (
        <div className="mb-5 flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
          {unclassified === 1 ? "1 tema não entra" : `${unclassified} temas não entram`} na comparação por área até serem classificados.
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="empty-state min-h-64">As métricas aparecem depois do primeiro tema cadastrado.</div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
            <section className="overflow-hidden card">
              <SectionHeading title="Progressão nas últimas 8 semanas" subtitle="Acertos sobre o total de questões das revisões, com o início de semana definido na sua rotina" />
              {reviews.length === 0 ? (
                <div className="flex min-h-64 items-center justify-center px-5 text-sm text-gray-500">Registre revisões para formar a curva.</div>
              ) : (
                <div className="px-4 pb-5 pt-7 sm:px-6">
                  <div className="flex h-56 items-end gap-2 border-b border-gray-200 sm:gap-4">
                    {weeklyTrend.map(week => (
                      <div key={week.key} title={week.average === null ? "Sem amostra de questões" : `${week.correctCount} acertos em ${week.questionCount} questões`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                        <span className="mb-2 text-xs font-semibold tabular-nums text-gray-700">{week.average !== null ? `${week.average}%` : <span aria-label="Sem amostra">—</span>}</span>
                        <div className="flex h-40 w-full max-w-12 items-end rounded-t bg-gray-100">
                          <div className="w-full rounded-t bg-blue-700" style={{ height: `${week.average === null ? 0 : week.average}%` }} />
                        </div>
                        <span className="mt-2 truncate text-[10px] font-medium text-gray-500">{week.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">— indica uma semana sem amostra de questões.</p>
                </div>
              )}
            </section>

            <section className="overflow-hidden card">
              <SectionHeading title="Distribuição atual" subtitle="Último resultado dos temas com questões registradas" />
              <div className="divide-y divide-gray-100">
                {performanceDistribution.map(({ band, count }) => {
                  const percentage = measuredBlocks.length ? Math.round((count / measuredBlocks.length) * 100) : 0;
                  return (
                    <div key={band} className="px-4 py-4">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-gray-700">{performanceLabel(band)}</span>
                        <span className="font-semibold tabular-nums text-gray-900">{count} · {percentage}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${performanceTone(band)}`} style={{ width: `${percentage}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="mt-6 overflow-hidden card">
            <SectionHeading title="Cinco grandes áreas" subtitle="Acertos sobre as questões dos últimos contatos e quantidade de temas abaixo de 70%" />
            <div className="divide-y divide-gray-100">
              {areaMetrics.map((metric, index) => (
                <div key={metric.area} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,2fr)_6rem_7rem] sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${["bg-area-1", "bg-area-2", "bg-area-3", "bg-area-4", "bg-area-5"][index]}`} />
                    <span className="text-sm font-semibold text-gray-900">{metric.area}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${["bg-area-1", "bg-area-2", "bg-area-3", "bg-area-4", "bg-area-5"][index]}`} style={{ width: `${metric.average ?? 0}%` }} /></div>
                  <span title={metric.average === null ? "Sem amostra" : `${metric.questionCount} questões`} className="text-sm font-semibold tabular-nums text-gray-900">{metric.average === null ? "Sem amostra" : `${metric.average}%`}</span>
                  <span className={`text-xs font-medium ${metric.weak > 0 ? "text-red-600" : "text-gray-500"}`}>{metric.weak} {metric.weak === 1 ? "tema frágil" : "temas frágeis"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 overflow-hidden card">
            <SectionHeading title="Temas que pedem atenção" subtitle="Ordenados pelo resultado mais baixo" />
            {weakTopics.length === 0 ? (
              <div className="flex min-h-28 items-center justify-center px-5 text-sm text-gray-500">{measuredBlocks.length ? "Nenhum tema abaixo de 70%." : "Registre questões para identificar quais temas pedem atenção."}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {weakTopics.map(block => (
                  <div key={block.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_6rem_8rem] sm:items-center">
                    <span className="truncate text-sm font-semibold text-gray-900">{block.title}</span>
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

function Metric({ icon, label, value, warning }: { icon: React.ReactNode; label: string; value: string | number; warning?: boolean }) {
  return (
    <div className="border-r border-gray-200 px-4 py-4 last:border-r-0">
      <div className={`flex items-center gap-2 text-xs font-medium ${warning ? "text-amber-700" : "text-gray-500"}`}>{icon}{label}</div>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight tabular-nums ${warning ? "text-amber-800" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-gray-200 px-4 py-3.5"><h2 className="text-sm font-semibold text-gray-900">{title}</h2><p className="mt-0.5 text-xs text-gray-500">{subtitle}</p></div>;
}

function performanceTone(band: ReturnType<typeof classifyPerformance>) {
  return {
    muito_bom: "bg-emerald-600",
    bom: "bg-blue-700",
    ruim: "bg-amber-500",
    muito_ruim: "bg-red-500",
  }[band];
}
